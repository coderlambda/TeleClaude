import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AgentType } from "./agent-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "../configs.json");

export type PermissionMode = "auto" | "ask";

export interface ChatConfig {
  autoreply: boolean;
  permissionMode: PermissionMode;
  agentType: AgentType;
}

type ConfigStore = Record<string, ChatConfig>;

function load(): ConfigStore {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}

function save(store: ConfigStore) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2));
}

const DEFAULT_CONFIG: ChatConfig = { autoreply: false, permissionMode: "auto", agentType: "claude" };

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

export function setAgentType(chatId: string, type: AgentType) {
  const store = load();
  store[chatId] = { ...DEFAULT_CONFIG, ...store[chatId], agentType: type };
  save(store);
}
