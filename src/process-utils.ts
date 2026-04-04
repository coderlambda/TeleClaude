import { execSync } from "child_process";

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function getChildPids(parentPid: number): number[] {
  try {
    return execSync(`pgrep -P ${parentPid}`, { encoding: "utf8" })
      .trim().split("\n").filter(Boolean).map(Number);
  } catch { return []; }
}

/** Recursively collect all descendants of a PID (depth-first) */
export function getDescendants(pid: number): number[] {
  const result: number[] = [];
  const children = getChildPids(pid);
  for (const child of children) {
    result.push(...getDescendants(child));
    result.push(child);
  }
  return result;
}

/** Kill a process and all its descendants. Tries process group kill first, falls back to tree walk. */
export function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGTERM") {
  // Try process group kill (most reliable, atomic)
  try { process.kill(-pid, signal); return; } catch {}
  // Fallback: walk the tree manually (children first, then parent)
  const descendants = getDescendants(pid);
  for (const desc of descendants) {
    try { process.kill(desc, signal); } catch {}
  }
  try { process.kill(pid, signal); } catch {}
}
