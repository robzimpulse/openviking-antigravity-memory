---
name: openviking-memory
description: >
  Use OpenViking long-term memory in Antigravity. Background hooks handle automatic
  recall and capture. Use MCP tools (search, read, remember) when manual exploration
  of memories, resources, or explicit fact preservation is needed.
---

# OpenViking Long-Term Memory for Antigravity

OpenViking connects Antigravity to the centralized long-term memory store shared
with other trusted local coding harnesses.

## Automatic Lifecycle Integration

- **Automatic Recall**: Before the first model invocation of each new user turn,
  relevant context is automatically retrieved and injected as ephemeral context.
- **Automatic Capture**: Completed user prompts and final assistant responses are
  captured in the background upon turn completion and periodically distilled.

Manual MCP tool calls are supplemental and should only be used when explicit
inspection or curation is necessary.

## Available MCP Tools

When the `openviking` MCP server is connected, the following tools are available:

1. **`search` / `find` / `recall`**:
   - Query long-term memories, directory structures, experiences, and resources.
   - Example: Searching for prior architectural decisions or project guidelines.
2. **`read`**:
   - Retrieve full content of a specific `viking://` URI returned from search results.
3. **`remember`**:
   - Explicitly store a durable fact, decision, preference, or hard-won procedure.

## Operational Rules & Safety

- **`viking://` URIs**: URIs beginning with `viking://` (e.g. `viking://user/...`)
  are OpenViking logical resources, **not** local filesystem paths or shell URLs.
  Never pass `viking://` URIs to filesystem tools (`view_file`, `cat`, etc.) or shell commands.
  Always inspect them via the OpenViking `read` MCP tool.
- **No Secrets**: Never save API keys, tokens, passwords, transient debug logs, raw tool outputs,
  or internal reasoning blocks into curated memories.
- **Advisory Status**: Recalled memories reflect previous states and conventions. Always verify
  live repository state, current package versions, and active workspace files. Current user
  instructions and live repository evidence always override historical memory.
