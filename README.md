# TeleClaude

Telegram bot that bridges to a local [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agent. Each chat gets an isolated workspace with persistent conversation history, file delivery, and interactive permission management.

## Features

- **Per-chat isolation** — each Telegram chat gets its own workspace directory and Claude Code session
- **Persistent sessions** — conversations resume across restarts (`--resume`)
- **Permission control** — Allow / Always Allow / Deny buttons for Bash commands, or skip permissions entirely
- **File delivery** — Claude can send files and images back via an outbox directory
- **Message batching** — multiple messages are queued and combined into a single prompt
- **Daemon supervisor** — auto-restart on crash with exponential backoff, orphan process cleanup
- **CLI tool** — `teleclaude start|stop|restart|status|logs`

## Prerequisites

- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`claude` command available)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Setup

```bash
git clone https://github.com/coderlambda/TeleClaude.git
cd TeleClaude
npm install
cp .env.example .env
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_CHAT_IDS=your_telegram_user_id
PERMISSION_PORT=3721
```

Get your Telegram user ID by messaging [@userinfobot](https://t.me/userinfobot). Multiple IDs can be comma-separated. Leave `ALLOWED_CHAT_IDS` empty to allow all users (not recommended).

## Usage

```bash
# Start the daemon (runs in background)
npx tsx src/cli.ts start

# Check status
npx tsx src/cli.ts status

# Restart the bot (daemon respawns it)
npx tsx src/cli.ts restart

# View logs
npx tsx src/cli.ts logs
npx tsx src/cli.ts logs -f    # follow mode

# Stop everything
npx tsx src/cli.ts stop
```

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Show help and chat info |
| `/clear` | Clear conversation context (memory preserved) |
| `/stop` | Abort the current task |
| `/enable_autoreply` | Respond to all messages in groups/channels |
| `/disable_autoreply` | Only respond to commands |
| `/permission ask` | Require approval for Bash commands |
| `/permission auto` | Auto-approve all commands |
| `/restart` | Restart the bot |
| `/info` | Show status info |

## Permission Modes

- **auto** — all commands run without approval (`--dangerously-skip-permissions`)
- **ask** — Bash commands show an inline keyboard with:
  - **Allow** — approve this command
  - **Always** — add a permission rule and approve (writes to `.claude/settings.json`)
  - **Deny** — block the command
  - Sending a text message while a permission prompt is active will deny and pass your message as the reason

## File Delivery

Claude can send files back to Telegram by placing them in the `outbox/` directory of the workspace. The bot delivers them automatically after each response.

```
# In Claude's workspace:
outbox/screenshot.png        # sent as photo
outbox/report.pdf            # sent as document
outbox/_manifest.json        # optional captions
```

## Architecture

```
teleclaude start
  └─ daemon.ts (supervisor)
       └─ index.ts (Telegram bot)
            ├─ permission-server.ts (HTTP on 127.0.0.1:3721)
            └─ claude-runner.ts
                 └─ claude CLI subprocess (per chat)
                      └─ hooks/ask-permission.js (for "ask" mode)
```

- **Daemon** — supervises the bot process, handles crash recovery with exponential backoff, manages lock files, cleans up orphan processes on startup
- **Bot** — Grammy-based Telegram bot, manages message queuing, progress display, and outbox delivery
- **Permission server** — HTTP server that mediates between Claude's PreToolUse hooks and Telegram inline keyboard callbacks
- **Claude runner** — spawns Claude CLI with `--output-format stream-json`, tracks sessions per chat, manages process lifecycle

All Claude subprocesses are spawned with `detached: true` and killed via process group signals for reliable cleanup.

## License

MIT
