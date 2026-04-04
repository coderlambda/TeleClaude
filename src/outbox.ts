import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

export interface OutboxItem {
  filePath: string;
  caption?: string;
  type: "photo" | "document";
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function detectType(filePath: string): "photo" | "document" {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase()) ? "photo" : "document";
}

interface ManifestEntry {
  file: string;
  caption?: string;
}

export function collectOutbox(workspaceDir: string): OutboxItem[] {
  const outboxDir = path.join(workspaceDir, "outbox");
  if (!fs.existsSync(outboxDir)) return [];

  // read optional manifest
  const manifest = new Map<string, string | undefined>();
  const manifestPath = path.join(outboxDir, "_manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const entries: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      for (const e of entries) manifest.set(e.file, e.caption);
    } catch (err) {
      logger.warn(`[outbox] Failed to parse _manifest.json: ${err}`);
    }
  }

  const items: OutboxItem[] = [];
  for (const entry of fs.readdirSync(outboxDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === "_manifest.json") continue;
    const filePath = path.join(outboxDir, entry.name);
    items.push({
      filePath,
      caption: manifest.get(entry.name),
      type: detectType(filePath),
    });
  }

  return items;
}

export function clearOutbox(workspaceDir: string) {
  const outboxDir = path.join(workspaceDir, "outbox");
  if (!fs.existsSync(outboxDir)) return;
  fs.rmSync(outboxDir, { recursive: true, force: true });
  logger.info(`[outbox] Cleared ${outboxDir}`);
}
