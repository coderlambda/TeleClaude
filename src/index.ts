import "dotenv/config";
import { Bot, Context, GrammyError, HttpError } from "grammy";
import { ClaudeRunner } from "./claude-runner.js";
import { CodexRunner } from "./codex-runner.js";
import type { AgentRunner, SendResult } from "./agent-runner.js";
import { getConfig, setAutoreply, setAgentType } from "./config-store.js";
import { upsertChannelMeta } from "./channel-registry.js";
import { collectOutbox, clearOutbox } from "./outbox.js";
import { PermissionServer } from "./permission-server.js";
import { setPermissionMode } from "./config-store.js";
import { InputFile } from "grammy";
import { logger } from "./logger.js";
import { RESTART_CODE } from "./constants.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RESTART_NOTIFY_FILE = path.join(ROOT, "restart-notify.json");
const ROOT_WORKSPACE = path.join(ROOT, "workspace");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");

// Authorized user IDs who can issue commands
const authorizedIds = new Set(
  (process.env.ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);
if (authorizedIds.size === 0) logger.warn("No ALLOWED_CHAT_IDS set — all users can use commands");
else logger.info(`Authorized users: ${[...authorizedIds].join(", ")}`);

const PERMISSION_PORT = parseInt(process.env.PERMISSION_PORT ?? "3721");

const bot = new Bot(token);
const claudeRunner = new ClaudeRunner(ROOT_WORKSPACE);
const codexRunner = new CodexRunner(ROOT_WORKSPACE);
const permServer = new PermissionServer(PERMISSION_PORT);

/** Return the correct runner for a chat based on its configured agent type */
function getRunner(chatId: string): AgentRunner {
  const config = getConfig(chatId);
  return config.agentType === "codex" ? codexRunner : claudeRunner;
}

// track permission and progress messages for cleanup
interface PermInfo {
  chatId: string;
  messageId: number;
  toolName: string;
  toolInput: Record<string, unknown>;
}
const permMsgIds = new Map<string, PermInfo>();
const progressMsgIds = new Map<string, number>(); // chatId → progress message_id
const pendingPerChat = new Map<string, string>(); // chatId → requestId (for text-as-deny)
const scopeOptions = new Map<string, { requestId: string; scopes: string[] }>(); // scopeGroupId → options

// wire permission server → Telegram
permServer.onAsk(async (req, requestId) => {
  const summary = formatToolInput(req.toolName, req.toolInput);
  const shortId = requestId.slice(0, 8);
  const msg = await bot.api.sendMessage(req.chatId,
    `<b>${req.toolName}</b>\n<blockquote>${summary}</blockquote>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Allow", callback_data: `perm:allow:${requestId}` },
          { text: "📝 Always", callback_data: `perm:always:${shortId}` },
          { text: "❌ Deny",  callback_data: `perm:deny:${requestId}`  },
        ]],
      },
    }
  );
  permMsgIds.set(requestId, { chatId: req.chatId, messageId: msg.message_id, toolName: req.toolName, toolInput: req.toolInput });
  permMsgIds.set(shortId, { chatId: req.chatId, messageId: msg.message_id, toolName: req.toolName, toolInput: req.toolInput });
  pendingPerChat.set(req.chatId, requestId);
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function generateScopes(toolName: string, input: Record<string, unknown>): string[] {
  if (toolName !== "Bash") return [`${toolName}(*)`];
  const cmd = String(input.command ?? "");
  const parts = cmd.split(/\s+/);
  const program = parts[0] ?? "";
  const scopes: string[] = [];
  // exact command
  if (cmd.length <= 50) scopes.push(`Bash(${cmd})`);
  // program + wildcard
  if (program) scopes.push(`Bash(${program} *)`);
  return scopes;
}

function addPermissionRule(chatId: string, rule: string) {
  const settingsDir = path.join(ROOT_WORKSPACE, chatId, ".claude");
  const settingsFile = path.join(settingsDir, "settings.json");
  fs.mkdirSync(settingsDir, { recursive: true });
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")); } catch {}
  const perms = (settings.permissions ?? {}) as Record<string, unknown>;
  const allow = (perms.allow ?? []) as string[];
  if (!allow.includes(rule)) allow.push(rule);
  perms.allow = allow;
  settings.permissions = perms;
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  logger.info(`[chat:${chatId}] Added permission rule: ${rule}`);
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Bash":   return `<code>${escapeHtml(String(input.command ?? "").slice(0, 300))}</code>`;
    case "Write":  return `<code>${escapeHtml(String(input.file_path ?? ""))}</code>`;
    case "Edit":   return `<code>${escapeHtml(String(input.file_path ?? ""))}</code>`;
    default:       return `<code>${escapeHtml(JSON.stringify(input, null, 2).slice(0, 300))}</code>`;
  }
}

// ─── authorization ────────────────────────────────────────────────────────────

/**
 * Returns true if the sender is authorized to issue commands.
 * - Channel posts have no `from`, so we trust channel-level commands
 *   (the user controls who posts in their channel).
 * - Private/group messages require the sender to be in authorizedIds.
 */
function isAuthorized(ctx: Context): boolean {
  if (ctx.chat?.type === "channel") return true; // trust channel admins
  const fromId = String(ctx.from?.id ?? "");
  if (authorizedIds.size === 0) return true;
  return authorizedIds.has(fromId);
}

// ─── message handler ──────────────────────────────────────────────────────────

function getChatName(ctx: Context): string {
  const chat = ctx.chat;
  if (!chat) return "unknown";
  if ("title" in chat) return chat.title ?? "unknown";
  const first = "first_name" in chat ? chat.first_name : "";
  const last  = "last_name"  in chat && chat.last_name ? ` ${chat.last_name}` : "";
  return `${first}${last}`.trim() || "unknown";
}

function recordMeta(ctx: Context, chatId: string) {
  const chat = ctx.chat;
  if (!chat) return;
  const type = chat.type as ChannelType;
  const username = ("username" in chat ? chat.username : undefined) as string | undefined;
  upsertChannelMeta(ROOT_WORKSPACE, { chatId, name: getChatName(ctx), type, username });
}

type ChannelType = "private" | "group" | "supergroup" | "channel";

// ── message queue: batch multiple messages into one Claude call ───────────

interface QueuedMessage { text: string; username: string }
const messageQueues = new Map<string, QueuedMessage[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const FLUSH_DELAY_MS = 500; // debounce: wait 500ms to collect rapid messages

function enqueue(chatId: string, text: string, username: string) {
  const queue = messageQueues.get(chatId) ?? [];
  queue.push({ text, username });
  messageQueues.set(chatId, queue);
  logger.info(`[chat:${chatId}] @${username}: ${text.slice(0, 100)}${text.length > 100 ? "…" : ""} (queued, ${queue.length} pending)`);
}

function drainQueue(chatId: string): string | null {
  const queue = messageQueues.get(chatId);
  if (!queue || queue.length === 0) return null;
  const messages = queue.splice(0);
  messageQueues.delete(chatId);

  if (messages.length === 1) return messages[0].text;
  // multiple messages → combine with attribution
  return messages.map(m => `@${m.username}: ${m.text}`).join("\n\n");
}

function scheduleFlush(chatId: string) {
  const existing = flushTimers.get(chatId);
  if (existing) clearTimeout(existing);
  flushTimers.set(chatId, setTimeout(() => {
    flushTimers.delete(chatId);
    processQueue(chatId).catch(err =>
      logger.error(`[chat:${chatId}] processQueue error: ${err}`)
    );
  }, FLUSH_DELAY_MS));
}

// ── command handler (immediate, not queued) ──────────────────────────────

async function handleMessage(
  chatId: string,
  rawText: string,
  ctx: Context,
  isChannel: boolean,
) {
  recordMeta(ctx, chatId);
  const username = ctx.from?.username ?? ctx.from?.first_name ?? (isChannel ? "channel" : "unknown");
  // strip @botname suffix from commands (e.g. /clear@MyBot → /clear)
  const text = rawText.replace(/@\S+/, "").trim();

  // ── commands — handled immediately ────────────────────────────────────

  if (text === "/start") {
    const config = getConfig(chatId);
    await ctx.reply(
      "TeleClaude Agent\n\n" +
      "/clear — 清除对话上下文（记忆保留）\n" +
      "/stop — 中止当前任务\n" +
      "/agent claude — 切换到 Claude Code\n" +
      "/agent codex — 切换到 OpenAI Codex\n" +
      "/enable_autoreply — 回复所有人的消息\n" +
      "/disable_autoreply — 仅回复命令\n" +
      "/restart — 重启 bot\n" +
      "/info — 状态信息\n\n" +
      `Chat ID: ${chatId}\n` +
      `Agent: ${config.agentType}\n` +
      `Autoreply: ${config.autoreply ? "on" : "off"}`
    );
    return;
  }

  if (text === "/clear") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    getRunner(chatId).clearSession(chatId);
    await ctx.reply("上下文已清除，记忆保留。下次对话将开始新会话。");
    logger.info(`[chat:${chatId}] /clear by @${username}`);
    return;
  }

  if (text === "/enable_autoreply") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    setAutoreply(chatId, true);
    await ctx.reply("Autoreply enabled — 我会回复所有人的消息。");
    logger.info(`[chat:${chatId}] autoreply enabled by @${username}`);
    return;
  }

  if (text === "/disable_autoreply") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    setAutoreply(chatId, false);
    await ctx.reply("Autoreply disabled — 仅响应命令。");
    logger.info(`[chat:${chatId}] autoreply disabled by @${username}`);
    return;
  }

  if (text === "/permission ask" || text === "/permission auto") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    const mode = text === "/permission ask" ? "ask" : "auto";
    setPermissionMode(chatId, mode);
    await ctx.reply(
      mode === "ask"
        ? "Permission mode: ask — Bash 命令执行前会发消息让你确认。"
        : "Permission mode: auto — 所有操作自动批准。"
    );
    logger.info(`[chat:${chatId}] permission mode → ${mode}`);
    return;
  }

  if (text === "/agent claude" || text === "/agent codex") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    const agentType = text === "/agent codex" ? "codex" as const : "claude" as const;
    setAgentType(chatId, agentType);
    await ctx.reply(
      agentType === "codex"
        ? "Agent switched to Codex (OpenAI)."
        : "Agent switched to Claude Code."
    );
    logger.info(`[chat:${chatId}] agent type → ${agentType} by @${username}`);
    return;
  }

  if (text === "/stop") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    const stopped = getRunner(chatId).stop(chatId);
    await ctx.reply(stopped ? "Stopping current task..." : "No task running.");
    logger.info(`[chat:${chatId}] /stop by @${username} (was running: ${stopped})`);
    return;
  }

  if (text === "/restart") {
    if (!isAuthorized(ctx)) { await ctx.reply("Unauthorized."); return; }
    logger.info(`[chat:${chatId}] /restart by @${username}`);
    fs.writeFileSync(RESTART_NOTIFY_FILE, JSON.stringify({ chatId }));
    await ctx.reply("Stopping...");
    setTimeout(() => process.exit(RESTART_CODE), 500);
    return;
  }

  if (text === "/info") {
    const config = getConfig(chatId);
    const runner = getRunner(chatId);
    const sessionId = runner.getSession(chatId);
    const totalSessions = runner.listSessions().length;
    await ctx.reply(
      `PID: ${process.pid}\n` +
      `Chat ID: ${chatId}\n` +
      `Agent: ${config.agentType}\n` +
      `Session: ${sessionId ? sessionId.slice(0, 8) + "…" : "none"}\n` +
      `Autoreply: ${config.autoreply ? "on" : "off"}\n` +
      `Permission: ${config.permissionMode}\n` +
      `Total sessions: ${totalSessions}`
    );
    return;
  }

  // ── autoreply / authorization checks ──────────────────────────────────

  const config = getConfig(chatId);
  const isCommand = text.startsWith("/");
  const isPrivate = ctx.chat?.type === "private";

  if (!isPrivate && !config.autoreply) {
    logger.info(`[chat:${chatId}] Skipped (autoreply off, type=${ctx.chat?.type}): ${text.slice(0, 40)}`);
    return;
  }

  if (isPrivate && !isAuthorized(ctx)) {
    await ctx.reply("Unauthorized.");
    return;
  }

  // ── if pending permission, text = deny + comment ───────────────────────

  const pendingReqId = pendingPerChat.get(chatId);
  if (pendingReqId) {
    const resolved = permServer.respond(pendingReqId, false, text);
    if (resolved) {
      logger.info(`[chat:${chatId}] Text-as-deny: "${text.slice(0, 80)}"`);
      // delete the permission message
      const permMsg = permMsgIds.get(pendingReqId);
      if (permMsg) {
        try { await bot.api.deleteMessage(Number(permMsg.chatId), permMsg.messageId); } catch {}
        permMsgIds.delete(pendingReqId);
        permMsgIds.delete(pendingReqId.slice(0, 8));
      }
      pendingPerChat.delete(chatId);
      return;
    }
  }

  // ── queue message and schedule processing ─────────────────────────────

  enqueue(chatId, text, username);

  if (getRunner(chatId).isRunning(chatId)) {
    logger.info(`[chat:${chatId}] Agent busy — message queued`);
    return;
  }

  scheduleFlush(chatId);
}

// ── process queued messages → call Claude ────────────────────────────────

// (tool icons removed — clean text output)

async function processQueue(chatId: string) {
  const prompt = drainQueue(chatId);
  if (!prompt) return;
  const runner = getRunner(chatId);
  if (runner.isRunning(chatId)) {
    // re-queue: shouldn't happen but be safe
    enqueue(chatId, prompt, "system");
    return;
  }

  const numChatId = Number(chatId);
  const config = getConfig(chatId);
  const agentLabel = config.agentType === "codex" ? "Codex" : "Claude";

  logger.info(`[chat:${chatId}] → ${agentLabel} | "${prompt.slice(0, 100)}${prompt.length > 100 ? "…" : ""}"`);

  // ── progress message ──────────────────────────────────────────────────

  const progressMsg = await bot.api.sendMessage(numChatId, `<b>${agentLabel}: Working...</b>`, { parse_mode: "HTML" });
  progressMsgIds.set(chatId, progressMsg.message_id);
  const toolLines: string[] = [];
  let lastEditAt = 0;

  async function updateProgress() {
    const now = Date.now();
    if (now - lastEditAt < 2_000) return;
    lastEditAt = now;
    const shown = toolLines.slice(-8).join("\n");
    try {
      await bot.api.editMessageText(numChatId, progressMsg.message_id, `<b>${agentLabel}: Working...</b>\n<blockquote>${escapeHtml(shown)}</blockquote>`, { parse_mode: "HTML" });
    } catch {}
  }

  // ── call agent ────────────────────────────────────────────────────────

  let result: SendResult;
  try {
    result = await runner.send(chatId, prompt, (toolName, summary) => {
      if (toolName === "_text") {
        toolLines.push(summary);
      } else {
        toolLines.push(`${toolName}: ${summary}`);
      }
      logger.info(`[chat:${chatId}] ${toolName === "_text" ? "text" : "tool"}: ${toolName === "_text" ? summary : `${toolName} — ${summary}`}`);
      updateProgress();
    }, PERMISSION_PORT, config.permissionMode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[chat:${chatId}] ${agentLabel} error: ${msg}`);
    try { await bot.api.deleteMessage(numChatId, progressMsg.message_id); } catch {}
    await bot.api.sendMessage(numChatId, `❌ ${msg}`);
    // check for more queued messages
    scheduleFlush(chatId);
    return;
  }

  // delete progress message
  try { await bot.api.deleteMessage(numChatId, progressMsg.message_id); } catch {}
  progressMsgIds.delete(chatId);

  // ── send text response ────────────────────────────────────────────────

  const MAX = 4096;
  const { text: response, workspaceDir } = result;
  if (response.trim()) {
    if (response.length <= MAX) {
      await bot.api.sendMessage(numChatId, response);
    } else {
      const parts = Math.ceil(response.length / MAX);
      logger.info(`[chat:${chatId}] Splitting response into ${parts} parts`);
      for (let i = 0; i < response.length; i += MAX) {
        await bot.api.sendMessage(numChatId, response.slice(i, i + MAX));
      }
    }
  }

  // ── deliver outbox files ──────────────────────────────────────────────

  const outboxItems = collectOutbox(workspaceDir);
  if (outboxItems.length > 0) {
    logger.info(`[chat:${chatId}] Delivering ${outboxItems.length} outbox file(s)`);
    for (const item of outboxItems) {
      try {
        const file = new InputFile(item.filePath);
        if (item.type === "photo") {
          await bot.api.sendPhoto(numChatId, file, item.caption ? { caption: item.caption } : {});
        } else {
          await bot.api.sendDocument(numChatId, file, item.caption ? { caption: item.caption } : {});
        }
        logger.info(`[chat:${chatId}] Sent ${item.type}: ${item.filePath}`);
      } catch (err) {
        logger.error(`[chat:${chatId}] Failed to send file ${item.filePath}: ${err}`);
      }
    }
    clearOutbox(workspaceDir);
  }

  // ── process any messages that arrived while agent was running ──────────
  scheduleFlush(chatId);
}

// ─── grammy event handlers ────────────────────────────────────────────────────

// log every incoming update type for debugging
bot.use(async (ctx, next) => {
  const type = Object.keys(ctx.update).filter(k => k !== "update_id")[0] ?? "unknown";
  logger.info(`[update] type=${type} id=${ctx.update.update_id}`);
  await next();
});

// permission approve/deny/always button callbacks
bot.on("callback_query:data", async (ctx) => {
  logger.info(`[callback] raw: ${JSON.stringify(ctx.callbackQuery.data)}`);

  const data = ctx.callbackQuery.data;

  if (!data.startsWith("perm:") && !data.startsWith("scope:")) {
    await ctx.answerCallbackQuery();
    return;
  }

  try {
    // ── scope selection (from "Always Allow") ─────────────────────────
    if (data.startsWith("scope:")) {
      const [, groupId, indexStr] = data.split(":");
      const group = scopeOptions.get(groupId);
      if (!group) {
        await ctx.answerCallbackQuery({ text: "Expired.", show_alert: true });
        return;
      }
      const rule = group.scopes[Number(indexStr)];
      const permInfo = permMsgIds.get(group.requestId) ?? permMsgIds.get(group.requestId.slice(0, 8));
      const chatId = permInfo?.chatId ?? String(ctx.callbackQuery.from.id);

      // write rule to settings
      addPermissionRule(chatId, rule);

      // allow the pending request
      permServer.respond(group.requestId, true);

      // clean up
      scopeOptions.delete(groupId);
      if (permInfo) {
        try { await bot.api.deleteMessage(Number(chatId), permInfo.messageId); } catch {}
        permMsgIds.delete(group.requestId);
        permMsgIds.delete(group.requestId.slice(0, 8));
      }
      pendingPerChat.delete(chatId);

      // delete the scope selection message
      try { await ctx.deleteMessage(); } catch {}

      await ctx.answerCallbackQuery({ text: `Added: ${rule}` });
      logger.info(`[permission] Always allow: ${rule}`);
      return;
    }

    // ── perm:allow / perm:deny / perm:always ──────────────────────────
    const [, action, id] = data.split(":");

    if (action === "always") {
      // id is shortId (8 chars), look up full info
      const permInfo = permMsgIds.get(id);
      if (!permInfo) {
        await ctx.answerCallbackQuery({ text: "Expired.", show_alert: true });
        return;
      }

      const scopes = generateScopes(permInfo.toolName, permInfo.toolInput);
      const groupId = id; // reuse shortId as groupId
      // find full requestId from pendingPerChat
      const fullRequestId = pendingPerChat.get(permInfo.chatId) ?? id;
      scopeOptions.set(groupId, { requestId: fullRequestId, scopes });

      // send scope selection message
      const buttons = scopes.map((s, i) => [{ text: s, callback_data: `scope:${groupId}:${i}` }]);
      await bot.api.sendMessage(Number(permInfo.chatId),
        "<b>Select scope to always allow:</b>",
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: buttons },
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // allow or deny
    const requestId = id;
    const allowed = action === "allow";

    logger.info(`[permission] callback ${requestId.slice(0, 8)} → ${action}`);

    const resolved = permServer.respond(requestId, allowed);

    if (!resolved) {
      await ctx.answerCallbackQuery({ text: "Already resolved or expired.", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: allowed ? "Allowed" : "Denied" });

    // delete the permission message & clean up
    const permMsg = permMsgIds.get(requestId);
    const chatId = permMsg?.chatId ?? String(ctx.callbackQuery.from.id);
    if (permMsg) {
      try { await bot.api.deleteMessage(Number(permMsg.chatId), permMsg.messageId); } catch {}
      permMsgIds.delete(requestId);
      permMsgIds.delete(requestId.slice(0, 8));
    }
    pendingPerChat.delete(chatId);
  } catch (err) {
    logger.error(`[permission] callback error: ${err}`);
    try { await ctx.answerCallbackQuery({ text: "Error processing response.", show_alert: true }); } catch {}
  }
});

// private chats and groups
bot.on("message:text", (ctx) => {
  const chatId = String(ctx.chat.id);
  handleMessage(chatId, ctx.message.text, ctx, false).catch(err =>
    logger.error(`[chat:${chatId}] Unhandled error: ${err}`)
  );
});

// channels (bot must be admin)
bot.on("channel_post:text", (ctx) => {
  const chatId = String(ctx.chat.id);
  handleMessage(chatId, ctx.channelPost.text, ctx, true).catch(err =>
    logger.error(`[chat:${chatId}] Unhandled error: ${err}`)
  );
});

bot.catch((err) => {
  const ctx = err.ctx;
  if (err.error instanceof GrammyError) {
    logger.error(`Grammy error on update ${ctx.update.update_id}: ${err.error.description}`);
  } else if (err.error instanceof HttpError) {
    logger.error(`HTTP error on update ${ctx.update.update_id}: ${err.error}`);
  } else {
    logger.error(`Unknown error on update ${ctx.update.update_id}:`, err.error);
  }
});

// ─── shutdown ─────────────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Shutting down (exit code ${exitCode})...`);

  // 1. Deny all pending permission requests (unblocks hook processes)
  await permServer.stop().catch(() => {});

  // 2. Kill all agent subprocesses (SIGTERM → SIGKILL after 2s)
  await Promise.all([claudeRunner.stopAll(), codexRunner.stopAll()]);

  // 3. Stop Grammy poller
  await bot.stop().catch(() => {});

  process.exit(exitCode);
}

// Force exit after 8s no matter what
function shutdownWithTimeout(exitCode: number) {
  const timer = setTimeout(() => process.exit(exitCode), 8_000);
  timer.unref();
  shutdown(exitCode);
}

process.on("SIGTERM", () => shutdownWithTimeout(0));
process.on("SIGINT",  () => shutdownWithTimeout(0));
process.on("SIGUSR1", () => shutdownWithTimeout(RESTART_CODE));

// Catch unhandled errors — clean up before crashing
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.stack ?? err}`);
  shutdownWithTimeout(1);
});
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled rejection: ${err}`);
  shutdownWithTimeout(1);
});

// ─── startup ──────────────────────────────────────────────────────────────────

logger.info(`Starting Telegram Agent (pid=${process.pid})...`);
logger.info(`Root workspace: ${ROOT_WORKSPACE}`);

// Periodic health check: prune dead agent processes every 30s
setInterval(() => {
  claudeRunner.pruneDeadProcesses();
  codexRunner.pruneDeadProcesses();
}, 30_000).unref();

await permServer.start();

bot.start({
  allowed_updates: ["message", "channel_post", "callback_query"],
  drop_pending_updates: true,
  onStart: async (info) => {
    logger.info(`Bot connected as @${info.username}`);

    if (fs.existsSync(RESTART_NOTIFY_FILE)) {
      try {
        const { chatId } = JSON.parse(fs.readFileSync(RESTART_NOTIFY_FILE, "utf8"));
        fs.unlinkSync(RESTART_NOTIFY_FILE);
        await bot.api.sendMessage(chatId, "Restarted ✓");
        logger.info(`[chat:${chatId}] Sent restart confirmation`);
      } catch (err) {
        logger.warn(`Failed to send restart notification: ${err}`);
      }
    }
  },
});
