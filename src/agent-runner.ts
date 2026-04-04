export type AgentType = "claude" | "codex";

export type ProgressCallback = (toolName: string, inputSummary: string) => void;

export interface SendResult {
  text: string;
  workspaceDir: string;
}

export interface AgentRunner {
  send(
    chatId: string,
    message: string,
    onProgress?: ProgressCallback,
    permissionPort?: number,
    permissionMode?: "auto" | "ask",
  ): Promise<SendResult>;

  stop(chatId: string): boolean;
  stopAll(): Promise<void>;
  isRunning(chatId: string): boolean;
  clearSession(chatId: string): void;
  getSession(chatId: string): string | null;
  listSessions(): { chatId: string; sessionId: string }[];
  pruneDeadProcesses(): void;
}
