import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

export interface CronJob {
  id: string;
  name: string;
  schedule: string; // cron expression: "min hour dom mon dow"
  prompt: string;   // message to send to agent when triggered
  command?: string; // optional shell command — output saved to logs/ and path passed to agent
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
}

type CronHandler = (chatId: string, prompt: string, jobName: string) => void;

const MARKER = "# teleclaude-managed";

export class CronManager {
  private rootWorkspace: string;
  private port: number;
  private handler?: CronHandler;
  private watcher: ReturnType<typeof setInterval> | null = null;
  private lastHash = "";

  constructor(rootWorkspace: string, triggerPort: number) {
    this.rootWorkspace = rootWorkspace;
    this.port = triggerPort;
  }

  onTrigger(fn: CronHandler) { this.handler = fn; }

  start() {
    this.syncAll();
    // watch for crons.json changes every 10s (cheap stat check)
    this.watcher = setInterval(() => this.checkForChanges(), 10_000);
    this.watcher.unref();
    logger.info("[cron] Manager started (using system crontab)");
  }

  stop() {
    if (this.watcher) { clearInterval(this.watcher); this.watcher = null; }
    this.removeManagedEntries();
  }

  /** Called by HTTP trigger endpoint */
  trigger(chatId: string, jobId: string, outputFile?: string) {
    const jobs = this.loadJobs(chatId);
    const job = jobs.find(j => j.id === jobId);
    if (!job) {
      logger.warn(`[cron] Trigger for unknown job ${jobId} in chat:${chatId}`);
      return;
    }
    job.lastRun = new Date().toISOString();
    this.saveJobs(chatId, jobs);

    let prompt = job.prompt;
    if (outputFile) {
      prompt += `\n[Script output: ${outputFile}]`;
      logger.info(`[cron] Fired "${job.name}" for chat:${chatId} (output: ${outputFile})`);
    } else {
      logger.info(`[cron] Fired "${job.name}" for chat:${chatId}`);
    }
    this.handler?.(chatId, prompt, job.name);
  }

  // ── crons.json management ──────────────────────────────────────────────

  private cronsFile(chatId: string): string {
    return path.join(this.rootWorkspace, chatId, "crons.json");
  }

  loadJobs(chatId: string): CronJob[] {
    try {
      return JSON.parse(fs.readFileSync(this.cronsFile(chatId), "utf8"));
    } catch { return []; }
  }

  saveJobs(chatId: string, jobs: CronJob[]) {
    fs.writeFileSync(this.cronsFile(chatId), JSON.stringify(jobs, null, 2));
  }

  // ── system crontab sync ────────────────────────────────────────────────

  private checkForChanges() {
    const hash = this.computeHash();
    if (hash !== this.lastHash) {
      this.lastHash = hash;
      this.syncAll();
    }
  }

  private computeHash(): string {
    // quick hash: concat all crons.json mtimes
    const chatDirs = this.listChatDirs();
    const parts: string[] = [];
    for (const chatId of chatDirs) {
      try {
        const stat = fs.statSync(this.cronsFile(chatId));
        parts.push(`${chatId}:${stat.mtimeMs}`);
      } catch { /* no crons.json */ }
    }
    return parts.join("|");
  }

  private syncAll() {
    const entries: string[] = [];

    for (const chatId of this.listChatDirs()) {
      const jobs = this.loadJobs(chatId);
      for (const job of jobs) {
        if (!job.enabled) continue;
        const parts = job.schedule.trim().split(/\s+/);
        if (parts.length !== 5) continue;

        const triggerUrl = `http://127.0.0.1:${this.port}/cron`;
        let cronLine: string;

        if (job.command) {
          // run script → save output to logs/ → trigger with output path
          const logsDir = path.join(this.rootWorkspace, chatId, "cron-logs");
          fs.mkdirSync(logsDir, { recursive: true });
          const logFile = path.join(logsDir, `${job.id}.log`);
          const escaped = job.command.replace(/'/g, "'\\''");
          // run command, capture stdout+stderr to log file, then curl trigger with output path
          cronLine = `${job.schedule} bash -c '${escaped}' > ${logFile} 2>&1; curl -sf -X POST ${triggerUrl} -H "Content-Type: application/json" -d '${JSON.stringify({ chatId, jobId: job.id, outputFile: logFile })}' > /dev/null 2>&1 ${MARKER}:${chatId}:${job.id}`;
        } else {
          // prompt-only: just trigger
          cronLine = `${job.schedule} curl -sf -X POST ${triggerUrl} -H 'Content-Type: application/json' -d '${JSON.stringify({ chatId, jobId: job.id })}' > /dev/null 2>&1 ${MARKER}:${chatId}:${job.id}`;
        }

        entries.push(cronLine);
      }
    }

    this.writeCrontab(entries);
    logger.info(`[cron] Synced ${entries.length} job(s) to system crontab`);
  }

  private writeCrontab(managedEntries: string[]) {
    // read existing crontab, strip our managed lines, append new ones
    let existing = "";
    try { existing = execSync("crontab -l 2>/dev/null", { encoding: "utf8" }); } catch {}

    const userLines = existing.split("\n").filter(l => !l.includes(MARKER));
    // remove trailing empty lines
    while (userLines.length > 0 && userLines[userLines.length - 1].trim() === "") userLines.pop();

    const newCrontab = [...userLines, ...managedEntries].join("\n") + "\n";
    execSync("crontab -", { input: newCrontab, encoding: "utf8" });
  }

  private removeManagedEntries() {
    try {
      const existing = execSync("crontab -l 2>/dev/null", { encoding: "utf8" });
      const cleaned = existing.split("\n").filter(l => !l.includes(MARKER)).join("\n");
      execSync("crontab -", { input: cleaned, encoding: "utf8" });
      logger.info("[cron] Removed managed entries from crontab");
    } catch {}
  }

  private listChatDirs(): string[] {
    try {
      return fs.readdirSync(this.rootWorkspace, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch { return []; }
  }
}
