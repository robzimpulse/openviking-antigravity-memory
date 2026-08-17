#!/usr/bin/env node

/**
 * Antigravity Lifecycle Hook Handler for OpenViking
 * 
 * Supports:
 *   - pre-invocation: Automatic memory recall before model call (once per user turn)
 *   - stop: Fast approved stop + detached background transcript capture and commit
 */

import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.mjs";
import { resolveOpenVikingCredentials } from "./shared/credentials.mjs";
import { createLogger } from "./shared/debug-log.mjs";
import { maybeDetach, readHookStdin } from "./shared/async-writer.mjs";
import { sendSessionMessages } from "./shared/batch-send.mjs";
import { buildServerAssembledBlock, buildRecallBlock } from "./shared/recall-core.mjs";
import { replayPending } from "./shared/pending-queue.mjs";
import {
  extractLatestUserPrompt,
  extractCaptureTurnsFromTranscript,
  readTranscriptFile,
} from "./antigravity-transcript.mjs";

const MAX_HASHES_RETAINED = 1000;

function sanitizeId(val) {
  return String(val || "default").replace(/[^A-Za-z0-9._-]/g, "_");
}

function stateFilePath(stateDir, conversationId) {
  return join(stateDir, `session_${sanitizeId(conversationId)}.json`);
}

function lockFilePath(stateDir, conversationId) {
  return join(stateDir, `lock_${sanitizeId(conversationId)}`);
}

async function acquireLock(lockPath, ttlMs = 10000) {
  try {
    await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
    await writeFile(lockPath, String(Date.now()), { flag: "wx", mode: 0o600 });
    return true;
  } catch (err) {
    if (err?.code === "EEXIST") {
      try {
        const raw = await readFile(lockPath, "utf-8");
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts > ttlMs) {
          await unlink(lockPath).catch(() => {});
          await writeFile(lockPath, String(Date.now()), { flag: "wx", mode: 0o600 });
          return true;
        }
      } catch {
        // Retry
      }
    }
    return false;
  }
}

async function releaseLock(lockPath) {
  try {
    await unlink(lockPath);
  } catch {
    // Ignore
  }
}

async function loadSessionState(filePath) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      conversationId: "",
      recalledPromptHashes: [],
      capturedHashes: [],
      lastActivityAt: Date.now(),
      lastCommittedAt: 0,
      createdAt: Date.now(),
    };
  }
}

async function saveSessionState(filePath, state) {
  try {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(tmp, filePath);
  } catch {
    // Best effort state persistence
  }
}

function makeFetchJSON(creds, cfg) {
  return async function fetchJSON(apiPath, init = {}, options = {}) {
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
    if (options.actorPeerId || creds.peerId || cfg.actorPeerId) {
      headers["X-OpenViking-Actor-Peer"] = options.actorPeerId || creds.peerId || cfg.actorPeerId;
    }

    const timeoutMs = options.timeoutMs || cfg.timeoutMs || 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      const text = await res.text();
      let result = null;
      try {
        result = JSON.parse(text);
      } catch {
        result = text;
      }
      return {
        ok: res.ok,
        status: res.status,
        result: res.ok ? result : undefined,
        error: !res.ok ? (result?.error?.message || result?.detail || result || `HTTP ${res.status}`) : undefined,
      };
    } catch (err) {
      return { ok: false, status: 0, error: err?.message || String(err) };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Sweep and commit old idle sessions owned by this plugin.
 */
async function sweepIdleSessions(fetchJSON, cfg, log) {
  try {
    const files = await readdir(cfg.stateDir).catch(() => []);
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith("session_") || !f.endsWith(".json")) continue;
      const fullPath = join(cfg.stateDir, f);
      try {
        const state = await loadSessionState(fullPath);
        if (!state.conversationId) continue;
        const idleTime = now - (state.lastActivityAt || state.createdAt || now);
        if (idleTime >= cfg.idleTtlMs && state.capturedHashes?.length > 0 && (!state.lastCommittedAt || state.lastCommittedAt < state.lastActivityAt)) {
          const sid = `${cfg.sessionPrefix}${state.conversationId}`;
          const commitRes = await fetchJSON(`/api/v1/sessions/${encodeURIComponent(sid)}/commit`, {
            method: "POST",
            body: JSON.stringify({ keep_recent_messages: cfg.commitKeepRecentCount }),
          });
          if (commitRes.ok) {
            state.lastCommittedAt = now;
            await saveSessionState(fullPath, state);
            log("idle_session_committed", { sessionId: sid, idleMinutes: Math.round(idleTime / 60000) });
          }
        }
      } catch {
        // Ignore single session failure
      }
    }
  } catch (err) {
    log("idle_sweep_failed", { error: err?.message || String(err) });
  }
}

/**
 * PreInvocation Hook: Auto-recall memory before model invocation.
 */
export async function handlePreInvocation(payload, cfg, creds, log) {
  const conversationId = payload?.conversationId || "";
  const transcriptPath = payload?.transcriptPath || "";
  const invocationNum = payload?.invocationNum || 1;

  if (!cfg.enabled || !cfg.autoRecall || !conversationId) {
    return {};
  }

  const fetchJSON = makeFetchJSON(creds, cfg);

  // Run idle sweep on first invocation
  if (invocationNum === 1) {
    void sweepIdleSessions(fetchJSON, cfg, log);
    void replayPending(fetchJSON, (cat, data) => log(cat, data)).catch(() => {});
  }

  // Parse transcript for latest user prompt
  const records = await readTranscriptFile(transcriptPath);
  const prompt = extractLatestUserPrompt(records, conversationId);
  if (!prompt || !prompt.content) {
    return {};
  }

  const statePath = stateFilePath(cfg.stateDir, conversationId);
  const lockPath = lockFilePath(cfg.stateDir, conversationId);

  const locked = await acquireLock(lockPath);
  let state = await loadSessionState(statePath);
  state.conversationId = conversationId;
  state.lastActivityAt = Date.now();

  const recalledList = Array.isArray(state.recalledPromptHashes) ? state.recalledPromptHashes : [];
  if (recalledList.includes(prompt.hash)) {
    if (locked) await releaseLock(lockPath);
    return {};
  }

  // Query OpenViking for relevant memory
  const sessionId = `${cfg.sessionPrefix}${conversationId}`;
  let memoryBlock = null;

  try {
    memoryBlock = await buildServerAssembledBlock(fetchJSON, cfg, prompt.content, {
      sessionId,
      actorPeerId: creds.peerId || cfg.actorPeerId,
      log: (cat, data) => log(cat, data),
    });

    if (memoryBlock === null) {
      memoryBlock = await buildRecallBlock(fetchJSON, cfg, prompt.content, {
        sessionId,
        actorPeerId: creds.peerId || cfg.actorPeerId,
        log: (cat, data) => log(cat, data),
      });
    }
  } catch (err) {
    log("recall_error", { error: err?.message || String(err) });
  }

  // Update recalled hashes list
  recalledList.push(prompt.hash);
  if (recalledList.length > MAX_HASHES_RETAINED) {
    recalledList.splice(0, recalledList.length - MAX_HASHES_RETAINED);
  }
  state.recalledPromptHashes = recalledList;
  await saveSessionState(statePath, state);
  if (locked) await releaseLock(lockPath);

  if (!memoryBlock || !memoryBlock.trim()) {
    return {};
  }

  log("recall_injected", {
    conversationId,
    stepIndex: prompt.stepIndex,
    length: memoryBlock.length,
  });

  return {
    injectSteps: [
      {
        ephemeralMessage: memoryBlock.trim(),
      },
    ],
  };
}

/**
 * Stop Hook Worker: Background parsing and session message capture.
 */
export async function handleStopWorker(payload, cfg, creds, log) {
  const conversationId = payload?.conversationId || "";
  const transcriptPath = payload?.transcriptPath || "";

  if (!cfg.enabled || !cfg.autoCapture || !conversationId) {
    return;
  }

  const records = await readTranscriptFile(transcriptPath);
  const turns = extractCaptureTurnsFromTranscript(records, conversationId, cfg);
  if (turns.length === 0) return;

  const statePath = stateFilePath(cfg.stateDir, conversationId);
  const lockPath = lockFilePath(cfg.stateDir, conversationId);
  const locked = await acquireLock(lockPath);

  const state = await loadSessionState(statePath);
  state.conversationId = conversationId;
  state.lastActivityAt = Date.now();

  const capturedHashes = new Set(Array.isArray(state.capturedHashes) ? state.capturedHashes : []);
  const newTurns = turns.filter((t) => !capturedHashes.has(t.hash));

  if (newTurns.length === 0) {
    if (locked) await releaseLock(lockPath);
    return;
  }

  const sessionId = `${cfg.sessionPrefix}${conversationId}`;
  const fetchJSON = makeFetchJSON(creds, cfg);
  const payloads = newTurns.map((t) => ({ role: t.role, content: t.content }));

  log("stop_capture_sending", {
    sessionId,
    count: payloads.length,
    roles: newTurns.map((t) => t.role),
  });

  const sendResult = await sendSessionMessages(fetchJSON, sessionId, payloads, {
    enqueueOnRetryable: true,
  });

  // Record captured hashes for sent or queued messages
  const successfulCount = sendResult.sent + sendResult.queued;
  for (let i = 0; i < successfulCount && i < newTurns.length; i++) {
    capturedHashes.add(newTurns[i].hash);
  }

  const hashesArray = [...capturedHashes];
  if (hashesArray.length > MAX_HASHES_RETAINED) {
    hashesArray.splice(0, hashesArray.length - MAX_HASHES_RETAINED);
  }
  state.capturedHashes = hashesArray;

  log("stop_capture_result", {
    sessionId,
    sent: sendResult.sent,
    queued: sendResult.queued,
    failed: sendResult.failed,
  });

  // Check pending tokens and commit if threshold reached
  if (sendResult.sent > 0) {
    try {
      const sessionRes = await fetchJSON(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
      const pendingTokens = sessionRes.ok ? (sessionRes.result?.pending_tokens || 0) : 0;
      if (pendingTokens >= cfg.commitTokenThreshold) {
        log("threshold_commit_start", { sessionId, pendingTokens });
        const commitRes = await fetchJSON(`/api/v1/sessions/${encodeURIComponent(sessionId)}/commit`, {
          method: "POST",
          body: JSON.stringify({ keep_recent_messages: cfg.commitKeepRecentCount }),
        });
        if (commitRes.ok) {
          state.lastCommittedAt = Date.now();
          log("threshold_commit_done", { sessionId });
        }
      }
    } catch (err) {
      log("threshold_commit_error", { error: err?.message || String(err) });
    }
  }

  await saveSessionState(statePath, state);
  if (locked) await releaseLock(lockPath);
}

export async function main() {
  const action = (process.argv[2] || "").toLowerCase().trim();
  const cfg = loadConfig();
  const creds = resolveOpenVikingCredentials();
  const logger = createLogger("antigravity-hook", cfg);
  const log = (cat, data) => {
    try { logger.log(cat, data); } catch {}
  };

  if (action === "stop") {
    // Non-blocking foreground fast exit: emit empty stop decision immediately (<500ms)
    const detached = await maybeDetach(cfg, {
      approve: () => {
        process.stdout.write(JSON.stringify({ decision: "" }) + "\n");
      },
    });

    if (detached) {
      return;
    }

    // Detached worker execution
    let rawStdin = "";
    try {
      rawStdin = await readHookStdin();
    } catch {
      return;
    }

    let payload = {};
    try {
      payload = JSON.parse(rawStdin);
    } catch {
      return;
    }

    try {
      await handleStopWorker(payload, cfg, creds, log);
    } catch (err) {
      log("stop_worker_error", { error: err?.message || String(err) });
    }
    return;
  }

  if (action === "pre-invocation") {
    let rawStdin = "";
    try {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      rawStdin = Buffer.concat(chunks).toString();
    } catch (err) {
      log("pre_invocation_stdin_error", { error: err?.message || String(err) });
      process.stdout.write("{}\n");
      return;
    }

    let payload = {};
    try {
      payload = JSON.parse(rawStdin);
    } catch {
      process.stdout.write("{}\n");
      return;
    }

    try {
      const result = await handlePreInvocation(payload, cfg, creds, log);
      process.stdout.write(JSON.stringify(result || {}) + "\n");
    } catch (err) {
      log("pre_invocation_unhandled_error", { error: err?.message || String(err) });
      process.stdout.write("{}\n");
    }
    return;
  }

  process.stderr.write(`Usage: antigravity-hook.mjs <pre-invocation|stop>\n`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    try {
      process.stdout.write("{}\n");
    } catch {}
    process.exitCode = 0;
  });
}
