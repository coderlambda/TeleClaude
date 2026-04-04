#!/usr/bin/env node
// PreToolUse hook — called by Claude Code before each tool execution.
// Reads tool call from stdin, posts to permission server, waits for decision.

import http from "http";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

async function askServer(port, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/ask",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Bad JSON from server: ${data}`)); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const port = parseInt(process.env.PERMISSION_PORT ?? "3721");
  const chatId = process.env.BOT_CHAT_ID;

  if (!chatId) {
    // no chatId means permission server isn't configured — allow
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0); // malformed input — allow
  }

  let result;
  try {
    result = await askServer(port, {
      chatId,
      toolName: input.tool_name,
      toolInput: input.tool_input,
    });
  } catch (err) {
    process.stderr.write(`[hook] Server error: ${err.message}\n`);
    // server unavailable — fall through to allow (fail open)
    process.exit(0);
  }

  if (result.decision === "allow") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    }));
    process.exit(0);
  } else {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        reason: result.reason ?? "Denied by user.",
      },
    }));
    process.exit(0);
  }
}

main();
