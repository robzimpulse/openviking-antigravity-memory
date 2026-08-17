#!/usr/bin/env node

/**
 * Maintenance & Diagnostics CLI for OpenViking Antigravity Plugin
 *
 * Usage:
 *   node manage.mjs status
 *   node manage.mjs list
 *   node manage.mjs flush [conversationId]
 *   node manage.mjs replay
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { resolveOpenVikingCredentials } from "./shared/credentials.mjs";
import { listPending, replayPending } from "./shared/pending-queue.mjs";

function redactKey(key) {
  if (!key) return "<none>";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function makeFetchJSON(creds, cfg) {
  return async function fetchJSON(apiPath, init = {}) {
    const baseUrl = (creds.baseUrl || "http://127.0.0.1:1933").replace(/\/+$/, "");
    const url = `${baseUrl}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": cfg.userAgent || "openviking-antigravity-memory/0.1.0",
      ...(init.headers || {}),
    };
    if (creds.apiKey) headers["Authorization"] = `Bearer ${creds.apiKey}`;
    if (creds.account) headers["X-OpenViking-Account"] = creds.account;
    if (creds.user) headers["X-OpenViking-User"] = creds.user;
    if (creds.peerId || cfg.actorPeerId) headers["X-OpenViking-Actor-Peer"] = creds.peerId || cfg.actorPeerId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs || 15000);
    try {
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      const text = await res.text();
      let result = null;
      try { result = JSON.parse(text); } catch { result = text; }
      return { ok: res.ok, status: res.status, result: res.ok ? result : undefined, error: !res.ok ? (result?.error?.message || result?.detail || result || `HTTP ${res.status}`) : undefined };
    } catch (err) {
      return { ok: false, status: 0, error: err?.message || String(err) };
    } finally {
      clearTimeout(timer);
    }
  };
}

async function getPluginSessions(stateDir) {
  const files = await readdir(stateDir).catch(() => []);
  const sessions = [];
  for (const f of files) {
    if (!f.startsWith("session_") || !f.endsWith(".json")) continue;
    try {
      const content = await readFile(join(stateDir, f), "utf-8");
      const state = JSON.parse(content);
      if (state?.conversationId) {
        sessions.push(state);
      }
    } catch {}
  }
  return sessions;
}

async function cmdStatus(cfg, creds) {
  const fetchJSON = makeFetchJSON(creds, cfg);
  const healthRes = await fetchJSON("/health");
  const statusRes = await fetchJSON("/api/v1/system/status");
  const pending = await listPending();
  const sessions = await getPluginSessions(cfg.stateDir);

  console.log("=== OpenViking Antigravity Plugin Status ===");
  console.log(`Server URL:         ${creds.baseUrl}`);
  console.log(`Server Healthy:     ${healthRes.ok ? "YES (v" + (healthRes.result?.version || "unknown") + ")" : "NO (" + (healthRes.error || "unreachable") + ")"}`);
  console.log(`Auth Mode:          ${healthRes.result?.auth_mode || "unknown"}`);
  console.log(`Account:            ${creds.account || "<none>"}`);
  console.log(`User:               ${creds.user || "<none>"}`);
  console.log(`API Key:            ${redactKey(creds.apiKey)}`);
  console.log(`Credential Source:  ${creds.credentialSource} (${creds.cliPath || "none"})`);
  console.log(`Actor Peer ID:      ${creds.peerId || cfg.actorPeerId}`);
  console.log(`Session Prefix:     ${cfg.sessionPrefix}`);
  console.log(`Pending Queue:      ${pending.length} item(s) in ${cfg.pendingDir}`);
  console.log(`Tracked Sessions:   ${sessions.length} session(s) in ${cfg.stateDir}`);
  console.log(`Log File:           ${cfg.debugLogPath}`);
  console.log(`System Status API:  ${statusRes.ok ? "OK" : "Error (" + statusRes.error + ")"}`);
}

async function cmdList(cfg, creds) {
  const pending = await listPending();
  const sessions = await getPluginSessions(cfg.stateDir);

  console.log(`=== Tracked Antigravity Sessions (${sessions.length}) ===`);
  for (const s of sessions) {
    console.log(`- Conversation ID:  ${s.conversationId}`);
    console.log(`  Session ID:       ${cfg.sessionPrefix}${s.conversationId}`);
    console.log(`  Captured Turns:   ${s.capturedHashes?.length || 0}`);
    console.log(`  Last Activity:    ${new Date(s.lastActivityAt || s.createdAt).toISOString()}`);
    console.log(`  Last Committed:   ${s.lastCommittedAt ? new Date(s.lastCommittedAt).toISOString() : "never"}`);
  }

  console.log(`\n=== Pending Queue Items (${pending.length}) ===`);
  for (const p of pending) {
    console.log(`- File: ${p.filename} | Type: ${p.entry.type} | Session: ${p.entry.sessionId} | Retries: ${p.entry.retries || 0}`);
  }
}

async function cmdFlush(cfg, creds, targetConversationId) {
  const fetchJSON = makeFetchJSON(creds, cfg);
  console.log("Replaying pending offline queue...");
  const replayResult = await replayPending(fetchJSON, (cat, d) => console.log(`[replay] ${cat}:`, d));
  console.log(`Replayed: ${replayResult.replayed}, Failed: ${replayResult.failed}, Skipped: ${replayResult.skipped}, Deferred: ${replayResult.deferred}`);

  const sessions = await getPluginSessions(cfg.stateDir);
  const filtered = targetConversationId
    ? sessions.filter((s) => s.conversationId === targetConversationId || `${cfg.sessionPrefix}${s.conversationId}` === targetConversationId)
    : sessions;

  console.log(`Flushing/committing ${filtered.length} session(s)...`);
  for (const s of filtered) {
    const sid = `${cfg.sessionPrefix}${s.conversationId}`;
    console.log(`Committing session ${sid}...`);
    const res = await fetchJSON(`/api/v1/sessions/${encodeURIComponent(sid)}/commit`, {
      method: "POST",
      body: JSON.stringify({ keep_recent_messages: cfg.commitKeepRecentCount }),
    });
    if (res.ok) {
      console.log(`  -> Success (task: ${res.result?.task_id || "ok"})`);
    } else {
      console.log(`  -> Failed: ${res.error}`);
    }
  }
}

async function cmdReplay(cfg, creds) {
  const fetchJSON = makeFetchJSON(creds, cfg);
  console.log("Replaying pending queue items...");
  const result = await replayPending(fetchJSON, (cat, d) => console.log(`[replay] ${cat}:`, d));
  console.log(`Done. Replayed: ${result.replayed}, Failed: ${result.failed}, Skipped: ${result.skipped}, Deferred: ${result.deferred}`);
}

async function main() {
  const cmd = (process.argv[2] || "status").toLowerCase();
  const cfg = loadConfig();
  const creds = resolveOpenVikingCredentials();

  switch (cmd) {
    case "status":
      await cmdStatus(cfg, creds);
      break;
    case "list":
      await cmdList(cfg, creds);
      break;
    case "flush":
      await cmdFlush(cfg, creds, process.argv[3]);
      break;
    case "replay":
      await cmdReplay(cfg, creds);
      break;
    default:
      console.error(`Unknown command: ${cmd}. Available: status, list, flush, replay`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Management command failed:", err);
  process.exitCode = 1;
});
