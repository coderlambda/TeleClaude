import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import { isAlive } from "./process-utils.js";
import type { AgentRunner, ProgressCallback, SendResult } from "./agent-runner.js";

// ── Codex JSON event types ──────────────────────────────────────────────────

interface CodexThreadStarted {
  type: "thread.started";
  thread_id: string;
}

interface CodexTurnStarted {
  type: "turn.started";
}

interface CodexItemStarted {
  type: "item.started";
  item: {
    id: string;
    type: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
    text?: string;
  };
}

interface CodexItemCompleted {
  type: "item.completed";
  item: {
    id: string;
    type: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
    text?: string;
  };
}

interface CodexTurnCompleted {
  type: "turn.completed";
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

type CodexEvent =
  | CodexThreadStarted
  | CodexTurnStarted
  | CodexItemStarted
  | CodexItemCompleted
  | CodexTurnCompleted
  | { type: string; [key: string]: unknown };

export class CodexRunner implements AgentRunner {
  private rootWorkspace: string;
  private activeProcs = new Map<string, ChildProcess>();

  constructor(rootWorkspace: string) {
    this.rootWorkspace = rootWorkspace;
  }

  // ── workspace ──────────────────────────────────────────────────────────────

  private workspaceDir(chatId: string): string {
    const dir = path.join(this.rootWorkspace, chatId);
    fs.mkdirSync(dir, { recursive: true });
    this.seedClaudeMd(dir);
    return dir;
  }

  private seedClaudeMd(dir: string) {
    const claudeMd = path.join(dir, "CLAUDE.md");
    if (fs.existsSync(claudeMd)) return;
    fs.writeFileSync(claudeMd, `# Agent Instructions

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
- Images (.png .jpg .jpeg .gif .webp) -> sent as photos
- Everything else -> sent as documents

The outbox is cleared automatically after each delivery.
`);
  }

  // ── session ────────────────────────────────────────────────────────────────

  private sessionFile(chatId: string): string {
    return path.join(this.workspaceDir(chatId), ".session-codex");
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
    logger.info(`[chat:${chatId}] Codex session cleared (was: ${old ?? "none"}) — workspace kept`);
  }

  // ── stop running process ───────────────────────────────────────────────────

  stop(chatId: string): boolean {
    const proc = this.activeProcs.get(chatId);
    if (!proc || !proc.pid) return false;
    try { process.kill(-proc.pid, "SIGTERM"); } catch { proc.kill("SIGTERM"); }
    setTimeout(() => {
      if (proc.pid && isAlive(proc.pid)) {
        logger.warn(`[chat:${chatId}] Codex did not exit, force killing`);
        try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
      }
    }, 5_000);
    return true;
  }

  stopAll(): Promise<void> {
    if (this.activeProcs.size === 0) return Promise.resolve();
    for (const [chatId, proc] of this.activeProcs) {
      logger.info(`[chat:${chatId}] Stopping Codex subprocess on shutdown`);
      if (proc.pid) {
        try { process.kill(-proc.pid, "SIGTERM"); } catch { proc.kill("SIGTERM"); }
      }
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        for (const [chatId, proc] of this.activeProcs) {
          if (proc.pid && isAlive(proc.pid)) {
            logger.warn(`[chat:${chatId}] Force killing Codex subprocess`);
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

  pruneDeadProcesses() {
    for (const [chatId, proc] of this.activeProcs) {
      if (proc.pid && !isAlive(proc.pid)) {
        logger.warn(`[chat:${chatId}] Pruned dead codex process (pid=${proc.pid})`);
        this.activeProcs.delete(chatId);
      }
    }
  }

  // ── send ───────────────────────────────────────────────────────────────────

  async send(
    chatId: string,
    message: string,
    onProgress?: ProgressCallback,
    _permissionPort?: number,
    permissionMode: "auto" | "ask" = "auto",
  ): Promise<SendResult> {
    if (this.activeProcs.has(chatId)) {
      throw new Error("Agent is already running. Use /stop to cancel.");
    }

    const sessionId = this.readSession(chatId);
    const dir = this.workspaceDir(chatId);

    let args: string[];
    if (sessionId) {
      // resume existing session
      args = ["exec", "resume", "--json", "--skip-git-repo-check", sessionId, message];
    } else {
      // new session
      args = ["exec", "--json", "--skip-git-repo-check", "-C", dir, message];
    }

    // permission / sandbox mode
    if (permissionMode === "auto") {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("--sandbox", "workspace-write");
    }

    logger.info(
      `[chat:${chatId}] → Codex | resume=${!!sessionId} | "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`
    );

    const start = Date.now();

    return new Promise((resolve, reject) => {
      const proc = spawn("codex", args, {
        cwd: dir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      this.activeProcs.set(chatId, proc);

      let lineBuffer = "";
      let stderr = "";
      let threadId: string | null = null;
      const agentMessages: string[] = [];

      proc.stdout.on("data", (chunk: Buffer) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: CodexEvent = JSON.parse(line);
            this.handleEvent(chatId, event, onProgress, agentMessages, (id) => { threadId = id; });
          } catch { /* skip malformed lines */ }
        }
      });

      proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

      proc.on("error", (err) => {
        this.activeProcs.delete(chatId);
        reject(new Error(`Failed to start Codex: ${err.message}`));
      });

      proc.on("close", (code, signal) => {
        this.activeProcs.delete(chatId);
        const elapsed = Date.now() - start;

        if (signal === "SIGTERM") {
          reject(new Error("Stopped by user."));
          return;
        }

        if (code !== 0) {
          logger.error(`[chat:${chatId}] Codex exited ${code} after ${elapsed}ms`);
          if (stderr) logger.error(`[chat:${chatId}] stderr: ${stderr.trim()}`);
          reject(new Error(`Codex exited with code ${code}\n${stderr}`));
          return;
        }

        // Save session if we got a thread_id
        if (threadId) {
          this.writeSession(chatId, threadId);
        }

        const finalText = agentMessages.join("\n\n").trim();
        if (!finalText) {
          reject(new Error("No result received from Codex."));
          return;
        }

        logger.info(
          `[chat:${chatId}] ← Codex | ${elapsed}ms | session:${threadId ?? "none"}`
        );
        resolve({ text: finalText, workspaceDir: dir });
      });
    });
  }

  private handleEvent(
    chatId: string,
    event: CodexEvent,
    onProgress?: ProgressCallback,
    agentMessages?: string[],
    onThreadId?: (id: string) => void,
  ) {
    switch (event.type) {
      case "thread.started": {
        const e = event as CodexThreadStarted;
        onThreadId?.(e.thread_id);
        logger.info(`[chat:${chatId}] Codex thread started: ${e.thread_id}`);
        break;
      }

      case "item.completed": {
        const e = event as CodexItemCompleted;
        if (e.item.type === "agent_message" && e.item.text) {
          agentMessages?.push(e.item.text);
          if (onProgress) {
            const line = e.item.text.split("\n")[0].slice(0, 100);
            if (line.trim()) onProgress("_text", line);
          }
        } else if (e.item.type === "command_execution" && e.item.command) {
          if (onProgress) {
            onProgress("Bash", e.item.command.slice(0, 80));
          }
        }
        break;
      }

      case "item.started": {
        const e = event as CodexItemStarted;
        if (e.item.type === "command_execution" && e.item.command && onProgress) {
          onProgress("Bash", e.item.command.slice(0, 80));
        }
        break;
      }

      case "turn.completed": {
        const e = event as CodexTurnCompleted;
        if (e.usage) {
          logger.info(
            `[chat:${chatId}] Codex turn done | in=${e.usage.input_tokens ?? 0} out=${e.usage.output_tokens ?? 0}`
          );
        }
        break;
      }
    }
  }
}
