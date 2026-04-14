import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { isAlive } from "./process-utils.js";
import type { AgentRunner, ProgressCallback, SendResult } from "./agent-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.join(__dirname, "../hooks/ask-permission.js");

interface StreamEvent {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
}

function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? "").slice(0, 80);
  switch (toolName) {
    case "Bash":       return s(input.command);
    case "Read":       return s(input.file_path);
    case "Write":      return s(input.file_path);
    case "Edit":       return s(input.file_path);
    case "Glob":       return s(input.pattern);
    case "Grep":       return s(input.pattern);
    case "WebFetch":   return s(input.url);
    case "WebSearch":  return s(input.query);
    default:           return JSON.stringify(input).slice(0, 80);
  }
}

export class ClaudeRunner implements AgentRunner {
  private rootWorkspace: string;
  private activeProcs = new Map<string, ChildProcess>();

  constructor(rootWorkspace: string) {
    this.rootWorkspace = rootWorkspace;
  }

  // ── workspace ──────────────────────────────────────────────────────────────

  private workspaceDir(chatId: string): string {
    const dir = path.join(this.rootWorkspace, chatId);
    fs.mkdirSync(dir, { recursive: true });
    this.seedClaudeMd(dir); // idempotent — skips if CLAUDE.md already exists
    return dir;
  }

  private seedClaudeMd(dir: string) {
    const claudeMd = path.join(dir, "CLAUDE.md");
    if (fs.existsSync(claudeMd)) return;
    fs.writeFileSync(claudeMd, `# Agent Instructions

## Receiving Files from the User

Files sent by the user are saved to \`inbox/\` (relative to this workspace).
When a user sends a file, you will receive a message like:
\`[User sent file: inbox/filename.pdf]\`
You can read, analyze, or process these files directly from the inbox path.

## Sending Files to the User

To send files or images back to the user via Telegram, place them in the \`outbox/\`
directory (relative to this workspace). The service checks the outbox after every
response and delivers the files automatically.

### Steps
1. Create the file (write a PNG, generate a PDF, capture output, etc.)
2. Move or copy it to \`outbox/<filename>\`
3. Optionally create \`outbox/_manifest.json\` to set captions

### outbox/_manifest.json (optional)
\`\`\`json
[
  { "file": "screenshot.png", "caption": "Dashboard screenshot" },
  { "file": "report.pdf", "caption": "Weekly report" }
]
\`\`\`

### File type detection
- Images (.png .jpg .jpeg .gif .webp) → sent as photos
- Everything else → sent as documents

The outbox is cleared automatically after each delivery.

## Scheduled Tasks (Cron Jobs)

**IMPORTANT: Do NOT use the built-in CronCreate tool — it does not work in this environment.**
Instead, create scheduled tasks by writing to \`crons.json\` in this workspace.
Jobs are synced to the system crontab automatically.

### crons.json format
\`\`\`json
[
  {
    "id": "unique-id",
    "name": "Daily Report",
    "schedule": "0 9 * * *",
    "prompt": "Generate and send the daily summary report",
    "enabled": true,
    "createdAt": "2026-01-01T00:00:00Z"
  },
  {
    "id": "unique-id-2",
    "name": "Health Check",
    "schedule": "0 * * * *",
    "prompt": "Analyze the health check results and alert if anything is wrong",
    "command": "python3 scripts/health_check.py",
    "enabled": true,
    "createdAt": "2026-01-01T00:00:00Z"
  }
]
\`\`\`

### Fields
- \`prompt\` — message sent to you when the job fires
- \`command\` (optional) — shell script to run before triggering; output is saved to \`cron-logs/<id>.log\` and the path is appended to your prompt as \`[Script output: path]\`

### Schedule format (cron expression)
\`min hour dom mon dow\`
- \`0 9 * * *\` — every day at 9:00 AM
- \`0 9 * * 1-5\` — weekdays at 9:00 AM
- \`0 0 1 * *\` — first of every month at midnight

### What you receive
- Prompt-only job: \`[Cron: job-name] prompt-text\`
- Script job: \`[Cron: job-name] prompt-text\\n[Script output: cron-logs/id.log]\`
  You can read the log file to see the script's output.
`);
  }

  // ── session ────────────────────────────────────────────────────────────────

  private sessionFile(chatId: string): string {
    const dir = this.workspaceDir(chatId);
    const newPath = path.join(dir, ".session-claude");
    // migrate legacy .session → .session-claude (one-time)
    if (!fs.existsSync(newPath)) {
      const legacyPath = path.join(dir, ".session");
      if (fs.existsSync(legacyPath)) {
        try {
          fs.renameSync(legacyPath, newPath);
          logger.info(`[chat:${chatId}] Migrated .session → .session-claude`);
        } catch {}
      }
    }
    return newPath;
  }

  private readSession(chatId: string): string | null {
    try { return fs.readFileSync(this.sessionFile(chatId), "utf8").trim() || null; }
    catch { return null; }
  }

  private writeSession(chatId: string, sessionId: string) {
    fs.writeFileSync(this.sessionFile(chatId), sessionId);
  }

  private deleteSession(chatId: string) {
    try { fs.unlinkSync(this.sessionFile(chatId)); } catch {}
  }

  getSession(chatId: string): string | null { return this.readSession(chatId); }

  listSessions(): { chatId: string; sessionId: string }[] {
    if (!fs.existsSync(this.rootWorkspace)) return [];
    return fs.readdirSync(this.rootWorkspace, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .flatMap(e => {
        const s = this.readSession(e.name);
        return s ? [{ chatId: e.name, sessionId: s }] : [];
      });
  }

  clearSession(chatId: string) {
    const old = this.readSession(chatId);
    this.deleteSession(chatId);
    logger.info(`[chat:${chatId}] Session cleared (was: ${old ?? "none"}) — workspace kept`);
  }

  // ── stop running process ───────────────────────────────────────────────────

  stop(chatId: string): boolean {
    const proc = this.activeProcs.get(chatId);
    if (!proc || !proc.pid) return false;
    // SIGTERM first (lets Claude clean up hooks), escalate to SIGKILL
    try { process.kill(-proc.pid, "SIGTERM"); } catch { proc.kill("SIGTERM"); }
    setTimeout(() => {
      if (proc.pid && isAlive(proc.pid)) {
        logger.warn(`[chat:${chatId}] Claude did not exit, force killing`);
        try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
      }
    }, 5_000);
    return true;
  }

  /** Kill all active subprocesses. SIGTERM first, then SIGKILL after 2s. */
  stopAll(): Promise<void> {
    if (this.activeProcs.size === 0) return Promise.resolve();
    // Phase 1: SIGTERM (process group) — lets Claude clean up hook children
    for (const [chatId, proc] of this.activeProcs) {
      logger.info(`[chat:${chatId}] Stopping subprocess on shutdown`);
      if (proc.pid) {
        try { process.kill(-proc.pid, "SIGTERM"); } catch { proc.kill("SIGTERM"); }
      }
    }
    // Phase 2: SIGKILL survivors after 2s
    return new Promise((resolve) => {
      setTimeout(() => {
        for (const [chatId, proc] of this.activeProcs) {
          if (proc.pid && isAlive(proc.pid)) {
            logger.warn(`[chat:${chatId}] Force killing subprocess`);
            try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
          }
        }
        this.activeProcs.clear();
        resolve();
      }, 2_000);
    });
  }

  isRunning(chatId: string): boolean {
    return this.activeProcs.has(chatId);
  }

  /** Periodic health check: remove dead processes from activeProcs */
  pruneDeadProcesses() {
    for (const [chatId, proc] of this.activeProcs) {
      if (proc.pid && !isAlive(proc.pid)) {
        logger.warn(`[chat:${chatId}] Pruned dead claude process (pid=${proc.pid})`);
        this.activeProcs.delete(chatId);
      }
    }
  }

  // ── send ───────────────────────────────────────────────────────────────────

  async send(
    chatId: string,
    message: string,
    onProgress?: ProgressCallback,
    permissionPort?: number,
    permissionMode: "auto" | "ask" = "auto",
  ): Promise<SendResult> {
    if (this.activeProcs.has(chatId)) {
      throw new Error("Agent is already running. Use /stop to cancel.");
    }

    const sessionId = this.readSession(chatId);
    const dir = this.workspaceDir(chatId);

    const args = [
      "-p", message,
      "--output-format", "stream-json",
      "--verbose",
    ];
    if (sessionId) args.push("--resume", sessionId);

    if (permissionMode === "auto") {
      args.push("--dangerously-skip-permissions");
    } else {
      // ask mode: auto-approve edits, prompt user via Telegram for Bash
      args.push("--permission-mode", "acceptEdits");
      if (permissionPort) {
        const hookSettings = {
          hooks: {
            PreToolUse: [{
              matcher: "Bash",
              hooks: [{ type: "command", command: `node ${HOOK_SCRIPT}` }],
            }],
          },
        };
        args.push("--settings", JSON.stringify(hookSettings));
      }
    }

    logger.info(
      `[chat:${chatId}] → Claude | resume=${!!sessionId} | "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`
    );

    const start = Date.now();

    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (permissionPort) {
        env.BOT_CHAT_ID = chatId;
        env.PERMISSION_PORT = String(permissionPort);
      }

      const proc = spawn("claude", args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
      this.activeProcs.set(chatId, proc);

      let lineBuffer = "";
      let finalResult: StreamEvent | null = null;
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: StreamEvent = JSON.parse(line);
            this.handleEvent(chatId, event, onProgress);
            if (event.type === "result") finalResult = event;
          } catch { /* skip malformed lines */ }
        }
      });

      proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

      proc.on("error", (err) => {
        this.activeProcs.delete(chatId);
        reject(new Error(`Failed to start Claude: ${err.message}`));
      });

      proc.on("close", (code, signal) => {
        this.activeProcs.delete(chatId);
        const elapsed = Date.now() - start;

        if (signal === "SIGTERM") {
          reject(new Error("Stopped by user."));
          return;
        }

        if (code !== 0) {
          logger.error(`[chat:${chatId}] Claude exited ${code} after ${elapsed}ms`);
          if (stderr) logger.error(`[chat:${chatId}] stderr: ${stderr.trim()}`);
          reject(new Error(`Claude exited with code ${code}\n${stderr}`));
          return;
        }

        if (!finalResult) {
          reject(new Error("No result received from Claude."));
          return;
        }

        if (finalResult.is_error) {
          logger.error(`[chat:${chatId}] Claude error: ${finalResult.result}`);
          reject(new Error(finalResult.result ?? "Unknown error"));
          return;
        }

        this.writeSession(chatId, finalResult.session_id!);
        logger.info(
          `[chat:${chatId}] ← Claude | ${elapsed}ms | $${(finalResult.total_cost_usd ?? 0).toFixed(4)} | session:${finalResult.session_id}`
        );
        resolve({ text: finalResult.result ?? "", workspaceDir: dir });
      });
    });
  }

  private handleEvent(chatId: string, event: StreamEvent, onProgress?: ProgressCallback) {
    if (event.type !== "assistant" || !onProgress) return;
    for (const block of event.message?.content ?? []) {
      if (block.type === "tool_use" && block.name) {
        const summary = summarizeInput(block.name, (block.input ?? {}) as Record<string, unknown>);
        onProgress(block.name, summary);
      } else if (block.type === "text" && block.text) {
        // first line of Claude's text as a status update
        const line = block.text.split("\n")[0].slice(0, 100);
        if (line.trim()) onProgress("_text", line);
      }
    }
  }
}
