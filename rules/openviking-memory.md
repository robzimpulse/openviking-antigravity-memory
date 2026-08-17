# OpenViking Memory Integration Rules

## 1. `viking://` URIs
- URIs starting with `viking://` are virtual resources hosted on the OpenViking server.
- They are **not** filesystem paths and **not** network URLs.
- Never pass a `viking://` URI to `view_file`, `grep_search`, `list_dir`, `run_command`, or any local filesystem tool.
- To read or search `viking://` resources, use the `openviking` MCP tools (`search`, `read`).

## 2. Privacy & Credential Safety
- Never store API keys, authentication tokens, passwords, private SSH keys, or environment secrets in OpenViking memories.
- Never save internal model thinking, raw bulk tool output, or transient logs as durable memory.

## 3. Advisory Nature of Memory
- Context injected from OpenViking represents historical knowledge and user preferences.
- Treat historical facts as advisory; always verify against current code, dependencies, and live repository files.
- Immediate user instructions and actual codebase state supersede recalled memories.
