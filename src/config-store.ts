import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "../configs.json");

export type PermissionMode = "auto" | "ask";

interface ChatConfig {
  autoreply: boolean;
  permissionMode: PermissionMode;
}

type ConfigStore = Record<string, ChatConfig>;

function load(): ConfigStore {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}

function save(store: ConfigStore) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2));
}

const DEFAULT_CONFIG: ChatConfig = { autoreply: false, permissionMode: "auto" };

export function getConfig(chatId: string): ChatConfig {
  const store = load();
  return { ...DEFAULT_CONFIG, ...store[chatId] };
}

export function setAutoreply(chatId: string, enabled: boolean) {
  const store = load();
  store[chatId] = { ...DEFAULT_CONFIG, ...store[chatId], autoreply: enabled };
  save(store);
}

export function setPermissionMode(chatId: string, mode: PermissionMode) {
  const store = load();
  store[chatId] = { ...DEFAULT_CONFIG, ...store[chatId], permissionMode: mode };
  save(store);
}
