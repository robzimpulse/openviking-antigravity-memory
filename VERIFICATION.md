# OpenViking Antigravity Plugin Verification Report

## 1. Test Suite Summary

All automated tests ran against Node.js `v22.23.2` and live OpenViking server `v0.4.13`.

### Unit Tests
- `test/unit/transcript.test.mjs`: Validated JSON Lines parsing, handling of out-of-order `step_index`, exclusion of internal thinking blocks, tool calls, tool results, checkpoints, and deterministic turn hashing.
- `test/unit/hook.test.mjs`: Validated `PreInvocation` deduplication per user turn, fail-open behavior on network errors/unreachable endpoints, and `Stop` hook idempotency across repeated runs.
- `test/unit/session.test.mjs`: Validated session prefixing (`ag-*`) and deterministic workspace peer ID calculation.
- `test/unit/redaction.test.mjs`: Verified that API keys and authentication tokens are never written to disk logs or stdout.

### Integration Tests (Live OpenViking Server)
- `test/integration/mcp-live.test.mjs`: Verified stdio JSON-RPC initialization, SSE response parsing, and dynamic tool discovery (`search`, `read`, `remember`, etc.) against `http://127.0.0.1:1933`.
- `test/integration/hook-live.test.mjs`: Verified live `Stop` message delivery and `PreInvocation` memory search without blocking foreground execution.
- `test/integration/offline-queue.test.mjs`: Verified local offline queue serialization (`~/.openviking/antigravity/pending/`) during simulated outages and automatic replay upon recovery.

### Isolation Test
- `test/isolation/identity-isolation.test.mjs`: Verified that the fallback `antigravity` account key cannot read private user memories belonging to `vladimir-dev`, confirming why `home-coding/vladimir-dev` is the necessary shared production identity.

## 2. Installation Verification

- **Installed Directory**: `/home/vladimir/.gemini/config/plugins/openviking-memory/`
- **Permissions**:
  - Plugin directory & scripts: `0755`
  - Runtime root `~/.openviking/antigravity/`: `0700`
  - Credentials file `~/.openviking/antigravity/ovcli.conf`: `0600`
  - State & pending directories: `0700`
  - Logs `~/.openviking/antigravity/logs/hooks.jsonl`: `0600`
- **Global Config Integrity**:
  - Global `~/.gemini/config/mcp_config.json` was left completely untouched.
  - The plugin bundles its own `mcp_config.json` and `hooks.json`.

## 3. Maintenance CLI Checks

```bash
node /home/vladimir/.gemini/config/plugins/openviking-memory/scripts/manage.mjs status
```
Outputs connection health, account identity (`home-coding/vladimir-dev`), actor peer ID (`antigravity`), queue depth, and session tracking status.
