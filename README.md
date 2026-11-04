# OpenViking Memory Plugin for Google Antigravity (deprecated)

> **Deprecated.** This standalone plugin is superseded by an Antigravity host built on
> OpenViking's own memory-plugin runtime. Do not install it. Remove it as described below and use
> the replacement.

## Why

- **It no longer works against current OpenViking servers.** The plugin vendors OpenViking
  v0.4.13's shared plugin library. Its recall reads uid-less URIs (`viking://user/memories`,
  `viking://user/skills`) that current servers reject, and calls the deprecated
  `/api/v1/search/recall`, so automatic recall comes back empty.
- **Capture loses tool activity.** Only user prompts and final assistant answers are sent; tool
  calls and their results are dropped.
- **It is tied to one machine.** The installer, `hooks.json`, `mcp_config.json` and
  `uninstall.sh` hardcode the original author's paths and identity (`/home/vladimir/...`,
  account `home-coding`, user `vladimir-dev`).

The replacement runs on OpenViking's shared plugin runtime, so it follows server changes
instead of drifting from them.

## Use the built-in Antigravity host instead

The replacement provides:

- the user profile at the start of each conversation, as a persistent system message;
- recall once per turn, before the model's first call;
- capture of every turn, including each tool call with its output or error, and a commit after
  every turn;
- a guard that stops `read_file` on `viking://` URIs and points the agent at the MCP tools;
- the OpenViking MCP tools, which Antigravity calls through `call_mcp_tool`.

It is a temporary solution on the
[robzimpulse/OpenViking](https://github.com/robzimpulse/OpenViking) fork
([robzimpulse/OpenViking#1](https://github.com/robzimpulse/OpenViking/pull/1)), kept until
upstream OpenViking ships official Antigravity support. Install it from that fork:

```bash
git clone --branch feat/antigravity-host https://github.com/robzimpulse/OpenViking.git
cd OpenViking
bash examples/memory-plugin-shared/install.sh --harness antigravity --source dev
```

Once that PR is merged, clone the fork's `main` instead. When upstream releases its own
Antigravity support, switch to it and follow upstream's documentation.

The installer takes the server URL and API key from `~/.openviking/ovcli.conf`, or asks for
them; pass `--url <server-url> --api-key <api-key>` to set them. It does not read this plugin's
`~/.openviking/antigravity/ovcli.conf`. Restart the Antigravity App afterwards.

Full documentation: the
[Antigravity host contract](https://github.com/robzimpulse/OpenViking/blob/feat/antigravity-host/examples/agent-hook-plugin/hosts/antigravity/DESIGN.md)
and the
[agent-hook plugin README](https://github.com/robzimpulse/OpenViking/blob/feat/antigravity-host/examples/agent-hook-plugin/README.md).

## Remove this plugin

Both plugins install into `~/.gemini/config/plugins/openviking-memory`, so remove this one
before installing the replacement. Do not rely on `./uninstall.sh`: it targets the original
author's home directory and removes nothing on any other machine.

1. Check which plugin is installed. The replacement has an `agent-integrations/` directory;
   this plugin does not.

   ```bash
   ls -d ~/.gemini/config/plugins/openviking-memory/agent-integrations 2>/dev/null \
     && echo "replacement installed: keep it" \
     || echo "this plugin, or nothing, is installed"
   ```

2. If it is this plugin, delete it and its runtime state (its credentials copy, logs and
   pending queue). Unsent turns in that queue are discarded. The replacement does not use
   `~/.openviking/antigravity`.

   ```bash
   rm -rf ~/.gemini/config/plugins/openviking-memory
   rm -rf ~/.openviking/antigravity
   ```

3. Restart the Antigravity App.

## History and license

The 0.1.0 code stays in this repository's history; see [CHANGELOG.md](CHANGELOG.md).

Distributed under the [MIT License](LICENSE). Includes vendored code from
[OpenViking](https://github.com/volcengine/OpenViking) under the Apache 2.0 License (see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
