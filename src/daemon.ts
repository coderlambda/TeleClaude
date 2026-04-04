import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { RESTART_CODE } from "./constants.js";
import { isAlive, killProcessTree } from "./process-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");
const LOG_FILE = path.join(ROOT, "bot.log");

// open log file and redirect daemon output to it
const logFd = fs.openSync(LOG_FILE, "a");
const writeLog = (s: string | Uint8Array): boolean => {
  const buf = typeof s === "string" ? Buffer.from(s) : Buffer.from(s);
  fs.writeSync(logFd, buf);
  return true;
};
process.stdout.write = writeLog as typeof process.stdout.write;
process.stderr.write = writeLog as typeof process.stderr.write;
const LOCK_FILE = path.join(ROOT, "daemon.lock");

// ─── lock file helpers ────────────────────────────────────────────────────────

interface LockData {
  daemonPid: number;
  childPid?: number;
}

function readLock(): LockData | null {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")); }
  catch { return null; }
}

function writeLock(data: LockData) {
  fs.writeFileSync(LOCK_FILE, JSON.stringify(data));
}

function removeLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

// ─── startup: single-instance guard + orphan cleanup ─────────────────────────

const existing = readLock();
if (existing) {
  if (isAlive(existing.daemonPid)) {
    logger.error(`[daemon] Already running (pid=${existing.daemonPid}). Exiting.`);
    process.exit(1);
  }
  // stale lock — previous daemon crashed; kill entire orphaned process tree
  logger.warn(`[daemon] Stale lock found (daemon pid=${existing.daemonPid} is dead)`);
  if (existing.childPid && isAlive(existing.childPid)) {
    logger.warn(`[daemon] Killing orphaned process tree (root pid=${existing.childPid})`);
    killProcessTree(existing.childPid, "SIGKILL");
  }
}

writeLock({ daemonPid: process.pid });

// ─── process supervisor ───────────────────────────────────────────────────────

const MAX_BACKOFF_MS = 60_000;
const HEALTHY_UPTIME_MS = 30_000;

let backoff = 1_000;
let child: ChildProcess | null = null;
let stopping = false;

function start() {
  if (stopping) return;

  const startedAt = Date.now();
  logger.info(`[daemon] Spawning bot (backoff was ${backoff}ms)`);

  child = spawn(TSX, ["src/index.ts"], {
    stdio: ["ignore", logFd, logFd],
    cwd: ROOT,
    env: process.env,
    detached: true, // own process group — enables atomic group kill
  });

  if (child.pid) {
    writeLock({ daemonPid: process.pid, childPid: child.pid });
  }

  child.on("error", (err) => {
    logger.error(`[daemon] Failed to spawn bot: ${err.message}`);
  });

  child.on("exit", (code, signal) => {
    child = null;
    writeLock({ daemonPid: process.pid }); // clear child pid from lock
    if (stopping) return;

    const uptime = Date.now() - startedAt;

    if (code === RESTART_CODE) {
      logger.info("[daemon] Bot requested restart — restarting immediately");
      backoff = 1_000;
      setImmediate(start);
      return;
    }

    if (code === 0) {
      logger.info("[daemon] Bot exited cleanly");
      return;
    }

    if (uptime >= HEALTHY_UPTIME_MS) backoff = 1_000;

    logger.warn(
      `[daemon] Bot crashed (code=${code ?? signal}, uptime=${uptime}ms) — restarting in ${backoff}ms`
    );
    const delay = backoff;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    setTimeout(start, delay);
  });
}

// ─── graceful shutdown ────────────────────────────────────────────────────────

function shutdown(sig: string) {
  if (stopping) return;
  stopping = true;
  logger.info(`[daemon] Received ${sig} — shutting down`);

  removeLock();

  if (child && child.pid) {
    // Kill entire process group (tsx + node bot + all claudes + hooks)
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    const forceKill = setTimeout(() => {
      logger.warn("[daemon] Bot did not exit in time — force killing process tree");
      if (child?.pid) {
        killProcessTree(child.pid, "SIGKILL");
      }
      process.exit(0);
    }, 5_000);
    forceKill.unref();
    child.on("exit", () => {
      clearTimeout(forceKill);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

logger.info(`[daemon] Started (pid=${process.pid})`);
start();
