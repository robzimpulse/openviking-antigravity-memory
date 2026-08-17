#!/usr/bin/env node

/**
 * stdio -> streamable-HTTP MCP proxy for OpenViking Antigravity plugin.
 *
 * Antigravity starts this process as a local stdio MCP server. The proxy reads
 * credentials from ~/.openviking/antigravity/ovcli.conf, forwards JSON-RPC
 * requests to OpenViking /mcp, and keeps stdio clean.
 */

import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../scripts/config.mjs";
import { createLogger } from "../scripts/shared/debug-log.mjs";
import { resolveOpenVikingCredentials } from "../scripts/shared/credentials.mjs";
import { createOpenVikingMcpProxy } from "../scripts/shared/mcp-proxy-core.mjs";
import { resolveEffectivePeerId } from "../scripts/shared/workspace-peer.mjs";
import { createExperienceToolProvider } from "./experience-tools.mjs";

export { createOpenVikingMcpProxy } from "../scripts/shared/mcp-proxy-core.mjs";

const DEFAULT_TIMEOUT_MS = 15000;

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return resolvePath(join(homedir(), raw.slice(2)));
  return resolvePath(raw);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

export function readProxyConfig(env = process.env) {
  const creds = resolveOpenVikingCredentials(env);
  const cfg = loadConfig(env);
  const effectivePeer = resolveEffectivePeerId({ cfg: { ...cfg, peerId: creds.peerId || cfg.actorPeerId }, cwd: process.cwd() });
  const mcpUrl = creds.mcpUrl || `${trimSlash(creds.baseUrl)}/mcp`;
  return {
    baseUrl: trimSlash(creds.baseUrl),
    mcpUrl,
    apiKey: creds.apiKey || "",
    account: creds.account || "",
    user: creds.user || "",
    peerId: effectivePeer.peerId || cfg.actorPeerId || "antigravity",
    userAgent: cfg.userAgent || "openviking-antigravity-memory/0.1.0",
    timeoutMs: Math.max(1000, Number(cfg.timeoutMs) || DEFAULT_TIMEOUT_MS),
    debug: cfg.debug === true,
    debugLogPath: cfg.debugLogPath,
    credentialSource: creds.credentialSource || "ovcli",
    credentialPath: creds.cliPath || creds.ovPath || "",
    watchedPaths: uniq([
      creds.cliPath,
      creds.ovPath,
      creds.cliPathCandidate,
      normalizePath(env.OPENVIKING_CLI_CONFIG_FILE),
      normalizePath(env.OPENVIKING_CONFIG_FILE),
      join(homedir(), ".openviking", "antigravity", "ovcli.conf"),
      join(homedir(), ".openviking", "ovcli.conf"),
    ]),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  const localToolProvider = createExperienceToolProvider();
  createOpenVikingMcpProxy({
    readConfig: readProxyConfig,
    loggerFactory: createLogger,
    localToolProvider,
  }).start();
}
