import http from "http";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";

export interface PermissionRequest {
  chatId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

type AskHandler = (req: PermissionRequest, requestId: string) => Promise<void>;

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export class PermissionServer {
  private server: http.Server;
  private pending = new Map<string, {
    resolve: (result: PermissionResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private askHandler?: AskHandler;
  readonly port: number;

  constructor(port: number) {
    this.port = port;
    this.server = http.createServer(this.handle.bind(this));
  }

  onAsk(fn: AskHandler) { this.askHandler = fn; }

  start(): Promise<void> {
    return new Promise((resolve) =>
      this.server.listen(this.port, "127.0.0.1", () => {
        logger.info(`[permission] Server listening on 127.0.0.1:${this.port}`);
        resolve();
      })
    );
  }

  /** Called when user taps Allow/Deny in Telegram */
  respond(requestId: string, allowed: boolean, reason?: string): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve({ allowed, reason });
    return true;
  }

  hasPending(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  /** Deny all pending requests and close the server */
  async stop() {
    // deny all pending requests so hook processes get a response and exit
    for (const [id, entry] of this.pending) {
      logger.info(`[permission] Denying pending request ${id.slice(0, 8)} on shutdown`);
      clearTimeout(entry.timer);
      entry.resolve({ allowed: false, reason: "Bot shutting down." });
    }
    this.pending.clear();
    // close HTTP server
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method !== "POST" || req.url !== "/ask") {
      res.writeHead(404); res.end(); return;
    }

    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      let permReq: PermissionRequest;
      try {
        permReq = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ decision: "block", reason: "Bad request" }));
        return;
      }

      const requestId = randomUUID();
      logger.info(
        `[permission] Request ${requestId.slice(0, 8)} — ` +
        `chat:${permReq.chatId} tool:${permReq.toolName}`
      );

      const result = await new Promise<PermissionResult>((resolve) => {
        // wait indefinitely until user responds
        const timer = setTimeout(() => {}, 0); // placeholder, never fires

        this.pending.set(requestId, { resolve, timer });

        this.askHandler?.(permReq, requestId).catch((err) => {
          logger.error(`[permission] Failed to send Telegram message: ${err}`);
          clearTimeout(timer);
          this.pending.delete(requestId);
          resolve({ allowed: false });
        });
      });

      const responseBody = result.allowed
        ? JSON.stringify({ decision: "allow" })
        : JSON.stringify({ decision: "block", reason: result.reason ?? "Denied by user." });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(responseBody);
      logger.info(`[permission] ${requestId.slice(0, 8)} → ${result.allowed ? "allow" : "deny"}`);
    });
  }
}
