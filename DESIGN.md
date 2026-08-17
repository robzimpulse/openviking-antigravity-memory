# Architecture and Design: Native OpenViking Memory for Antigravity

## 1. Overview

The `openviking-memory` plugin integrates Antigravity 2.0 with the centralized OpenViking server (`http://127.0.0.1:1933`). It enables bidirectional long-term memory sharing across local AI harnesses (Codex and Antigravity) without polluting global Antigravity configurations.

```
┌───────────────────────────────────────────────────────────┐
│                      Antigravity 2.0                      │
│                                                           │
│  ┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │ PreInvocation   │ │  MCP Proxy   │ │    Stop Hook    │ │
│  │      Hook       │ │   (stdio)    │ │   (Background)  │ │
│  └────────┬────────┘ └───────┬──────┘ └────────┬────────┘ │
└───────────┼──────────────────┼─────────────────┼──────────┘
            │                  │                 │
            ▼                  ▼                 ▼
   (HTTP Search/Recall)   (HTTP /mcp)    (HTTP Batch Messages)
            │                  │                 │
            └──────────────────┼─────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────┐
│               OpenViking Server (v0.4.13)                 │
│                 http://127.0.0.1:1933                     │
└───────────────────────────────────────────────────────────┘
```

## 2. Core Components

### 2.1 MCP Proxy (`servers/mcp-proxy.mjs`)
- Standard input/output JSON-RPC proxy for Model Context Protocol.
- Transparently proxies tool requests (`search`, `read`, `remember`) to OpenViking `/mcp` via Streamable HTTP.
- Automatically supplies tenant authentication headers (`Authorization`, `X-OpenViking-Account: home-coding`, `X-OpenViking-User: vladimir-dev`, `X-OpenViking-Actor-Peer: antigravity`).

### 2.2 PreInvocation Hook (`scripts/antigravity-hook.mjs pre-invocation`)
- **Trigger**: Runs before each model invocation.
- **Deduplication**: Identifies the latest `USER_INPUT` record and computes a turn hash (`conversationId:stepIndex:content`). If already recalled for the current user turn (e.g. within an internal tool-call loop), it immediately returns `{}`.
- **Recall Execution**: Queries OpenViking for top-ranked memory items relevant to the prompt (token budget: 2000, score threshold: 0.35, peer scope: all).
- **Ephemeral Injection**: Injects memory as an ephemeral system context block `<openviking-context source="auto-recall" format="digest">...</openviking-context>`.
- **Idle Session Sweep**: On turn 1 of any conversation, scans plugin-owned sessions and commits any session idle for >= 30 minutes.
- **Fail-Open**: On any network error, timeout, or invalid JSON, it logs a sanitized diagnostic and returns `{}` so model execution proceeds uninterrupted.

### 2.3 Stop Hook & Background Capture (`scripts/antigravity-hook.mjs stop`)
- **Trigger**: Runs upon completion of an Antigravity execution cycle.
- **Non-Blocking Foreground Exit**: Immediately outputs `{ "decision": "" }` (< 500ms) to allow Antigravity to return to the user without delay.
- **Detached Worker (`OV_HOOK_WORKER=1`)**: Spawns an unreferenced background Node process to handle parsing and network I/O.
- **Transcript Parsing**: Reads `transcript.jsonl`, isolating completed `USER_INPUT` and final `PLANNER_RESPONSE` records. Excludes internal thinking blocks, tool calls, tool results, checkpoints, and system history.
- **Deduplicated Append**: Appends new turns to OpenViking session `ag-<conversationId>`.
- **Threshold Commit**: If session pending tokens exceed 20,000, triggers a session distillation commit, keeping the last 10 messages.

### 2.4 Offline Queue (`scripts/shared/pending-queue.mjs`)
- If OpenViking is temporarily unreachable or returns retryable HTTP errors (502, 503, 504, 429), write payloads are durably serialized to `~/.openviking/antigravity/pending/` with `0600` permissions.
- Automatically replayed during subsequent PreInvocation runs or manual `manage.mjs flush`.

## 3. Identity and Security Model

- **Tenant**: `home-coding`
- **User**: `vladimir-dev` (shared with Codex for unified developer memory)
- **Actor Peer ID**: `antigravity`
- **Session ID**: `ag-<conversationId>`
- **User-Agent**: `openviking-antigravity-memory/0.1.0`
- **Secret Isolation**: Credentials live exclusively in `~/.openviking/antigravity/ovcli.conf` (`0600`).
