#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { isAlive, getChildPids, killProcessTree } from "./process-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCK_FILE = path.join(ROOT, "daemon.lock");
const LOG_FILE = path.join(ROOT, "bot.log");

// ─── helpers ─────────────────────────────────────────────────────────────────

interface LockData {
  daemonPid: number;
  childPid?: number;
}

function readLock(): LockData | null {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
  } catch {
    return null;
  }
}

function pidStartTime(pid: number): Date | null {
  try {
    const raw = execSync(`ps -o lstart= -p ${pid}`, { encoding: "utf8" }).trim();
    return new Date(raw);
  } catch {
    return null;
  }
}

function formatUptime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

// ─── commands ────────────────────────────────────────────────────────────────

function cmdStart() {
  const lock = readLock();
  if (lock && isAlive(lock.daemonPid)) {
    console.log(`Daemon already running (pid=${lock.daemonPid}).`);
    process.exit(0);
  }

  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const child = spawn(tsx, ["src/daemon.ts"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
    env: process.env,
  });
  child.unref();

  console.log(`Daemon started (pid=${child.pid}).`);
}

function cmdStop() {
  const lock = readLock();
  if (!lock || !isAlive(lock.daemonPid)) {
    console.log("Daemon is not running.");
    process.exit(0);
  }

  console.log(`Stopping daemon (pid=${lock.daemonPid})...`);
  process.kill(lock.daemonPid, "SIGTERM");

  // Wait up to 5 seconds for the daemon to exit
  const deadline = Date.now() + 5000;
  const poll = setInterval(() => {
    if (!isAlive(lock.daemonPid)) {
      clearInterval(poll);
      console.log("Daemon stopped.");
      process.exit(0);
    }
    if (Date.now() > deadline) {
      clearInterval(poll);
      console.log("Daemon did not exit in time — force killing process tree.");
      killProcessTree(lock.daemonPid, "SIGKILL");
      process.exit(0);
    }
  }, 200);
}

function cmdRestart() {
  const lock = readLock();

  if (!lock || !isAlive(lock.daemonPid)) {
    console.log("Daemon is not running. Starting...");
    cmdStart();
    return;
  }

  if (lock.childPid && isAlive(lock.childPid)) {
    // tsx wrapper — find actual node process underneath
    const children = getChildPids(lock.childPid);
    const target = children[0] ?? lock.childPid;
    process.kill(target, "SIGUSR1");
    console.log(`Restarted (SIGUSR1 → pid=${target}, daemon will respawn).`);
  } else {
    console.log(
      `Daemon running (pid=${lock.daemonPid}) but no bot child found.`
    );
  }
}

function cmdStatus() {
  const lock = readLock();

  if (!lock || !isAlive(lock.daemonPid)) {
    console.log("Status: stopped");
    if (lock) console.log("  (stale lock file exists)");
    process.exit(0);
  }

  console.log("Status: running");
  console.log(`  Daemon PID:  ${lock.daemonPid}`);

  const daemonStart = pidStartTime(lock.daemonPid);
  if (daemonStart) {
    console.log(`  Uptime:      ${formatUptime(Date.now() - daemonStart.getTime())}`);
  }

  if (lock.childPid && isAlive(lock.childPid)) {
    console.log(`  Bot PID:     ${lock.childPid}`);
    const botStart = pidStartTime(lock.childPid);
    if (botStart) {
      console.log(`  Bot uptime:  ${formatUptime(Date.now() - botStart.getTime())}`);
    }
  } else {
    console.log("  Bot PID:     (not running)");
  }
}

function cmdLogs(follow: boolean) {
  if (!fs.existsSync(LOG_FILE)) {
    console.log("No log file found.");
    process.exit(0);
  }

  if (follow) {
    const tail = spawn("tail", ["-f", "-n", "30", LOG_FILE], {
      stdio: "inherit",
    });
    tail.on("exit", (code) => process.exit(code ?? 0));
    // Forward signals so Ctrl-C cleanly kills tail
    process.on("SIGINT", () => tail.kill("SIGINT"));
    process.on("SIGTERM", () => tail.kill("SIGTERM"));
  } else {
    const tail = spawn("tail", ["-n", "30", LOG_FILE], {
      stdio: "inherit",
    });
    tail.on("exit", (code) => process.exit(code ?? 0));
  }
}

function cmdHelp() {
  console.log(`
teleclaude — Telegram bot daemon manager

Usage:
  teleclaude <command> [options]

Commands:
  start      Start the daemon (if not already running)
  stop       Gracefully stop the daemon
  restart    Restart the bot (daemon respawns it)
  status     Show running status and PIDs
  logs       Show last 30 lines of bot.log
  logs -f    Follow bot.log (like tail -f)
  help       Show this help message
`.trim());
}

// ─── main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] ?? "help";

switch (command) {
  case "start":
    cmdStart();
    break;
  case "stop":
    cmdStop();
    break;
  case "restart":
    cmdRestart();
    break;
  case "status":
    cmdStatus();
    break;
  case "logs":
    cmdLogs(args.includes("-f"));
    break;
  case "help":
  case "--help":
  case "-h":
    cmdHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
