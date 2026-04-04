import fs from "fs";
import path from "path";

export interface ChannelMeta {
  chatId: string;
  name: string;
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
  firstSeen: string;   // ISO
  lastSeen: string;    // ISO
}

// ─── per-chat metadata ────────────────────────────────────────────────────────

export function upsertChannelMeta(rootWorkspace: string, meta: Omit<ChannelMeta, "firstSeen" | "lastSeen">) {
  const dir = path.join(rootWorkspace, meta.chatId);
  fs.mkdirSync(dir, { recursive: true });

  const metaFile = path.join(dir, "meta.json");
  let existing: ChannelMeta | null = null;
  try { existing = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch {}

  const updated: ChannelMeta = {
    ...meta,
    firstSeen: existing?.firstSeen ?? new Date().toISOString(),
    lastSeen:  new Date().toISOString(),
  };

  // skip write if nothing changed (avoid unnecessary I/O on every message)
  if (
    existing &&
    existing.name === updated.name &&
    existing.username === updated.username &&
    existing.type === updated.type
  ) return;

  fs.writeFileSync(metaFile, JSON.stringify(updated, null, 2));
}

// ─── read all known channels ──────────────────────────────────────────────────

export function getAllChannels(rootWorkspace: string): ChannelMeta[] {
  const channels: ChannelMeta[] = [];
  if (!fs.existsSync(rootWorkspace)) return channels;

  for (const entry of fs.readdirSync(rootWorkspace, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaFile = path.join(rootWorkspace, entry.name, "meta.json");
    try {
      channels.push(JSON.parse(fs.readFileSync(metaFile, "utf8")));
    } catch { /* skip dirs without meta */ }
  }

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

