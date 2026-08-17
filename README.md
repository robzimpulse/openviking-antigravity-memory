# OpenViking Memory Plugin for Google Antigravity

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Antigravity](https://img.shields.io/badge/Antigravity-2.0-blue.svg)](https://antigravity.google)
[![OpenViking](https://img.shields.io/badge/OpenViking-v0.4.13-orange.svg)](https://github.com/volcengine/OpenViking)

A native, zero-dependency plugin that connects **Google Antigravity 2.0** to an **[OpenViking](https://github.com/volcengine/OpenViking)** long-term memory server.

Unlike standard MCP servers that require the model to manually call search tools for every turn, this plugin hooks directly into Antigravity's execution lifecycle:
- **Auto-Recall (`PreInvocation`)**: Injects relevant memories into the prompt before the model runs.
- **Auto-Capture (`Stop`)**: Asynchronously captures completed conversation turns in a detached background worker without UI latency.
- **Auto-Distillation**: Automatically distills sessions into curated memories when token limits are reached or sessions become idle.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                      Antigravity 2.0                      │
│                                                           │
│  ┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │ PreInvocation   │ │  MCP Proxy   │ │    Stop Hook    │ │
│  │   Auto-Recall   │ │ (search/read)│ │   (Background)  │ │
│  └────────┬────────┘ └───────┬──────┘ └────────┬────────┘ │
└───────────┼──────────────────┼─────────────────┼──────────┘
            │                  │                 │
            │ (Recall Digest)  │ (JSON-RPC)      │ (Batch Turns)
            ▼                  ▼                 ▼
┌───────────────────────────────────────────────────────────┐
│               OpenViking Server (v0.4.13)                 │
│                 http://127.0.0.1:1933                     │
└───────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Transparent Auto-Recall**
   - Automatically executes semantic search on OpenViking before the first model call of each user turn.
   - Per-turn SHA-256 hash deduplication ensures recall runs exactly once per user prompt (never repeated during internal tool-call loops).
   - Injected as an ephemeral system context block `<openviking-context source="auto-recall" format="digest">`.

2. **Non-Blocking Background Capture**
   - Foreground `Stop` hook returns `{ "decision": "" }` immediately (< 50 ms latency).
   - Spawns an unreferenced, detached background worker (`node` process) to parse `transcript.jsonl`.
   - Filters out internal thinking blocks, tool calls, tool results, checkpoints, and system history, extracting only clean user queries and final assistant answers.

3. **Intelligent Session Distillation**
   - Accumulates conversation turns in session `ag-<conversationId>`.
   - Automatically triggers memory distillation (`/commit`) when session pending tokens reach `20,000` (retaining the 10 most recent messages for ongoing context continuity).
   - Runs an idle sweep on turn 1 to commit sessions inactive for >= 30 minutes.

4. **MCP Tool Integration**
   - Connects Antigravity's stdio transport to OpenViking's Streamable HTTP `/mcp` endpoint.
   - Provides supplemental manual tools: `search`, `read`, `find`, `remember`, `search_experience`, and `read_experience`.

5. **Zero External Dependencies**
   - Built entirely with native Node.js standard libraries (`node:fs`, `node:stream`, `node:child_process`, `node:crypto`). No `node_modules` required.

6. **Offline Resilience & Queue Replay**
   - If the OpenViking server is temporarily unreachable, turns are durably serialized to disk (`~/.openviking/antigravity/pending/` with `0600` permissions) and replayed automatically on reconnection.

---

## Installation & Setup

### Prerequisites
- Node.js `v18.0.0` or higher
- Antigravity `2.0+`
- A running OpenViking server (e.g. `http://127.0.0.1:1933`)

### Quick Install

Clone the repository and run the automated installer:

```bash
git clone https://github.com/V0v1kkk/openviking-antigravity-memory.git
cd openviking-antigravity-memory
./install.sh
```

The installer will:
1. Validate Node.js and OpenViking server availability.
2. Configure credentials in `~/.openviking/antigravity/ovcli.conf` with restricted `0600` permissions.
3. Run the full test suite (`node --test`).
4. Atomically install the plugin to `~/.gemini/config/plugins/openviking-memory/`.

---

## Configuration

Settings can be customized via environment variables or inside `~/.openviking/antigravity/ovcli.conf`:

| Environment Variable | Default | Description |
| -------------------- | ------- | ----------- |
| `OPENVIKING_URL` | `http://127.0.0.1:1933` | OpenViking server endpoint |
| `OPENVIKING_API_KEY` | *(from config)* | Bearer API token |
| `OPENVIKING_ACCOUNT` | `home-coding` | OpenViking tenant account |
| `OPENVIKING_USER` | `vladimir-dev` | OpenViking user identity |
| `OPENVIKING_AUTO_RECALL` | `true` | Enable/disable automatic PreInvocation recall |
| `OPENVIKING_AUTO_CAPTURE` | `true` | Enable/disable automatic Stop capture |
| `OPENVIKING_COMMIT_TOKEN_THRESHOLD` | `20000` | Token threshold for triggering memory distillation |
| `OPENVIKING_ANTIGRAVITY_IDLE_TTL_MS` | `1800000` | Idle session commit timeout (30 mins) |
| `OPENVIKING_DEBUG` | `false` | Enable structured JSONL debug logging |

---

## Management & CLI Diagnostics

Use the built-in management script to inspect connections and manage sessions:

```bash
# Check server health, queue depth, and active credentials
node scripts/manage.mjs status

# List tracked Antigravity sessions and pending offline writes
node scripts/manage.mjs list

# Force commit pending sessions and replay queue
node scripts/manage.mjs flush

# Replay pending offline queue
node scripts/manage.mjs replay
```

---

## Running Tests

Execute the comprehensive test suite locally:

```bash
# Unit tests
node --test test/unit/*.test.mjs

# Integration tests (against live OpenViking server)
node --test test/integration/*.test.mjs

# Identity isolation test
node --test test/isolation/*.test.mjs
```

---

## Uninstallation

To remove the plugin from Antigravity:

```bash
./uninstall.sh

# To also purge cached runtime state and credentials:
./uninstall.sh --purge
```

---

## Contributing

Contributions are welcome! If you find a bug, have an optimization idea, or want to enhance functionality:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Ensure all tests pass (`node --test test/unit/*.test.mjs`).
4. Commit your changes and open a Pull Request.

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

---

## License

Distributed under the [MIT License](LICENSE). See `LICENSE` for more information.

Includes vendored proxy core and shared utilities from [OpenViking](https://github.com/volcengine/OpenViking) under the Apache 2.0 License (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
