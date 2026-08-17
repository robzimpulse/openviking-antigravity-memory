import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readProxyConfig } from "../../servers/mcp-proxy.mjs";
import { createOpenVikingMcpProxy } from "../../scripts/shared/mcp-proxy-core.mjs";
import { createLogger } from "../../scripts/shared/debug-log.mjs";
import { Writable } from "node:stream";

describe("live mcp proxy integration", () => {
  it("authenticates and lists tools via live OpenViking server", async () => {
    const config = readProxyConfig();
    assert.ok(config.baseUrl, "Base URL must be configured");
    assert.ok(config.apiKey, "API key must be present for live test");

    const outLines = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        const text = chunk.toString("utf-8");
        for (const line of text.split(/\r?\n/).filter(Boolean)) {
          try {
            outLines.push(JSON.parse(line));
          } catch {}
        }
        callback();
      },
    });

    const proxy = createOpenVikingMcpProxy({
      stdout: writable,
      readConfig: () => config,
      loggerFactory: createLogger,
    });

    // 1. Initialize
    await proxy.handleMessage({
      jsonrpc: "2.0",
      id: "test-init-1",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "antigravity-test", version: "0.1.0" },
      },
    });

    const initResp = outLines.find((m) => m.id === "test-init-1");
    assert.ok(initResp, "Should receive initialize response");
    assert.ok(initResp.result, "Initialize response should have result");

    // 2. Initialized notification
    await proxy.handleMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    // 3. List tools
    await proxy.handleMessage({
      jsonrpc: "2.0",
      id: "test-tools-2",
      method: "tools/list",
      params: {},
    });

    const toolsResp = outLines.find((m) => m.id === "test-tools-2");
    assert.ok(toolsResp, "Should receive tools/list response");
    assert.ok(Array.isArray(toolsResp.result?.tools), "Should return array of tools");
    assert.ok(toolsResp.result.tools.length > 0, "Discovered tools count should be > 0");

    await proxy.closeSession();
  });
});
