# OpenViking Memory Plugin for Antigravity

Native OpenViking long-term memory integration for Google Antigravity 2.0.

Provides automatic memory recall, background transcript capture, periodic session distillation, and Model Context Protocol (MCP) tools for explicit memory inspection and storage.

## Features

- **Automatic Recall (`PreInvocation`)**: Automatically retrieves relevant long-term memory context prior to each user turn and injects it as ephemeral context into the model prompt.
- **Background Capture (`Stop`)**: Non-blocking fast exit (<500ms) with detached background worker parsing completed turns and sending them to OpenViking.
- **Periodic Distillation**: Automatically commits sessions after accumulating >= 20,000 tokens (or after 30 minutes of inactivity), keeping 10 recent messages for ongoing context continuity.
- **MCP Tool Integration**: Provides stdio-to-HTTP MCP proxy for `search`, `read`, and `remember` tools inside Antigravity.
- **Secure Shared Identity**: Authenticates as `home-coding/vladimir-dev` with actor peer `antigravity` to share private knowledge with Codex while maintaining exact session attribution (`ag-*`).
- **Offline Resilience**: Automatically queues failed network operations locally to `~/.openviking/antigravity/pending/` and replays them when OpenViking reconnects.

## Directory Structure

- **Source Location**: `/home/vladimir/AI/LocalAI/pro-local-ai-setup/openviking/integrations/antigravity-memory/`
- **Installed Plugin**: `/home/vladimir/.gemini/config/plugins/openviking-memory/`
- **Runtime State & Credentials**: `/home/vladimir/.openviking/antigravity/`

## Quick Start

### Installation

Run the idempotent installer:

```bash
./install.sh
```

The installer:
1. Validates Node.js and OpenViking server health (`http://127.0.0.1:1933`).
2. Securely resolves credentials from `tenant-keys.json` without printing them.
3. Renders `/home/vladimir/.openviking/antigravity/ovcli.conf` with `0600` permissions.
4. Executes the full test suite.
5. Installs the plugin to `/home/vladimir/.gemini/config/plugins/openviking-memory/`.

### Management & Diagnostics

Inspect status and tracked sessions:

```bash
node scripts/manage.mjs status
node scripts/manage.mjs list
node scripts/manage.mjs flush
node scripts/manage.mjs replay
```

### Uninstallation

```bash
./uninstall.sh
# To also purge logs and credentials:
./uninstall.sh --purge
```

## Security & Privacy

- `0600` permissions on credential files (`ovcli.conf`).
- `0700` permissions on runtime state and pending directories.
- Keys are never logged, printed to stdout/stderr, or committed to Git.
- `viking://` URIs are virtual resources and handled strictly via MCP tools.
