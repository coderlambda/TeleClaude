import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

export interface CronJob {
  id: string;
  name: string;
  schedule: string; // cron expression: "min hour dom mon dow"
  prompt: string;   // message to send to agent when triggered
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
}

type CronHandler = (chatId: string, prompt: string, jobName: string) => void;

export class CronManager {
  private rootWorkspace: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private handler?: CronHandler;

  constructor(rootWorkspace: string) {
    this.rootWorkspace = rootWorkspace;
  }

  onTrigger(fn: CronHandler) { this.handler = fn; }

  start() {
    // check every 60 seconds
    this.timer = setInterval(() => this.tick(), 60_000);
    this.timer.unref();
    logger.info("[cron] Manager started (checking every 60s)");
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private tick() {
    const now = new Date();
    const chatDirs = this.listChatDirs();

    for (const chatId of chatDirs) {
      const jobs = this.loadJobs(chatId);
      for (const job of jobs) {
        if (!job.enabled) continue;
        if (this.matchesCron(job.schedule, now)) {
          logger.info(`[cron] Firing job "${job.name}" for chat:${chatId}`);
          job.lastRun = now.toISOString();
          this.saveJobs(chatId, jobs);
          this.handler?.(chatId, job.prompt, job.name);
        }
      }
    }
  }

  private listChatDirs(): string[] {
    try {
      return fs.readdirSync(this.rootWorkspace, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch { return []; }
  }

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

  // Parse cron expression and check if it matches the given time.
  // Format: "min hour dom mon dow"
  // Supports: numbers, *, ranges (1-5), steps (e.g. every 10), lists (1,3,5)
  private matchesCron(expr: string, date: Date): boolean {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const fields = [
      date.getMinutes(),   // 0-59
      date.getHours(),     // 0-23
      date.getDate(),      // 1-31
      date.getMonth() + 1, // 1-12
      date.getDay(),       // 0-6 (0=Sunday)
    ];

    const ranges = [
      [0, 59], [0, 23], [1, 31], [1, 12], [0, 6],
    ];

    for (let i = 0; i < 5; i++) {
      if (!this.matchField(parts[i], fields[i], ranges[i][0], ranges[i][1])) {
        return false;
      }
    }
    return true;
  }

  private matchField(pattern: string, value: number, min: number, max: number): boolean {
    for (const part of pattern.split(",")) {
      // step: */n or n-m/s
      const [range, stepStr] = part.split("/");
      const step = stepStr ? parseInt(stepStr) : 1;

      if (range === "*") {
        if ((value - min) % step === 0) return true;
      } else if (range.includes("-")) {
        const [lo, hi] = range.split("-").map(Number);
        if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      } else {
        if (parseInt(range) === value) return true;
      }
    }
    return false;
  }
}
