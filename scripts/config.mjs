import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { resolveOpenVikingCredentials } from "./shared/credentials.mjs";

const DEFAULT_PLUGIN_DIR = join(homedir(), ".openviking", "antigravity");
const DEFAULT_LOG_PATH = join(DEFAULT_PLUGIN_DIR, "logs", "hooks.jsonl");
const DEFAULT_STATE_DIR = join(DEFAULT_PLUGIN_DIR, "state");
const DEFAULT_PENDING_DIR = join(DEFAULT_PLUGIN_DIR, "pending");
const DEFAULT_OVCLI_CONF = join(DEFAULT_PLUGIN_DIR, "ovcli.conf");

function str(val, fallback = "") {
  if (typeof val === "string" && val.trim()) return val.trim();
  return fallback;
}

function bool(val, fallback = true) {
  if (val === undefined || val === null || val === "") return fallback;
  const s = String(val).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return fallback;
}

function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function tryLoadJson(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export function loadConfig(env = process.env) {
  const cliConfigFile = env.OPENVIKING_CLI_CONFIG_FILE || DEFAULT_OVCLI_CONF;
  const cliData = tryLoadJson(cliConfigFile) || {};
  const pluginSettings = (cliData && typeof cliData.plugin === "object" && cliData.plugin) ? cliData.plugin : {};
  const antigravitySettings = (pluginSettings.antigravity && typeof pluginSettings.antigravity === "object")
    ? pluginSettings.antigravity
    : {};

  const merged = { ...pluginSettings, ...antigravitySettings };

  const enabled = bool(env.OPENVIKING_MEMORY_ENABLED, bool(merged.enabled, true));
  const autoRecall = bool(env.OPENVIKING_AUTO_RECALL, bool(merged.autoRecall, true));
  const autoCapture = bool(env.OPENVIKING_AUTO_CAPTURE, bool(merged.autoCapture, true));
  const workspacePeer = bool(env.OPENVIKING_WORKSPACE_PEER, bool(merged.workspacePeer, true));
  const writePathAsync = bool(env.OPENVIKING_WRITE_PATH_ASYNC, bool(merged.writePathAsync, true));

  const recallLimit = Math.max(1, Math.floor(num(env.OPENVIKING_RECALL_LIMIT, num(merged.recallLimit, 10))));
  const recallTokenBudget = Math.max(100, Math.floor(num(env.OPENVIKING_RECALL_TOKEN_BUDGET, num(merged.recallTokenBudget, 2000))));
  const recallMaxContentChars = Math.max(50, Math.floor(num(env.OPENVIKING_RECALL_MAX_CONTENT_CHARS, num(merged.recallMaxContentChars, 500))));
  const scoreThreshold = num(env.OPENVIKING_SCORE_THRESHOLD, num(merged.scoreThreshold, 0.35));

  const recallQueryExpansion = str(env.OPENVIKING_RECALL_QUERY_EXPANSION, str(merged.recallQueryExpansion, "off")).toLowerCase();
  const recallCompress = str(env.OPENVIKING_RECALL_COMPRESS, str(merged.recallCompress, "off")).toLowerCase();

  const commitTokenThreshold = Math.max(1000, Math.floor(num(env.OPENVIKING_COMMIT_TOKEN_THRESHOLD, num(merged.commitTokenThreshold, 20000))));
  const commitKeepRecentCount = Math.max(0, Math.floor(num(env.OPENVIKING_COMMIT_KEEP_RECENT_COUNT, num(merged.commitKeepRecentCount, 10))));
  const idleTtlMs = Math.max(10000, Math.floor(num(env.OPENVIKING_ANTIGRAVITY_IDLE_TTL_MS, num(merged.idleTtlMs, 1800000))));
  const timeoutMs = Math.max(1000, Math.floor(num(env.OPENVIKING_TIMEOUT_MS, num(merged.timeoutMs, 15000))));
  const debug = bool(env.OPENVIKING_DEBUG, bool(merged.debug, false));

  const stateDir = env.OPENVIKING_STATE_DIR || DEFAULT_STATE_DIR;
  const pendingDir = env.OPENVIKING_PENDING_DIR || DEFAULT_PENDING_DIR;
  const debugLogPath = env.OPENVIKING_LOG_PATH || DEFAULT_LOG_PATH;

  const userAgent = "openviking-antigravity-memory/0.1.0";
  const sessionPrefix = "ag-";
  const actorPeerId = "antigravity";

  return {
    enabled,
    autoRecall,
    autoCapture,
    workspacePeer,
    writePathAsync,
    recallLimit,
    recallTokenBudget,
    recallMaxContentChars,
    scoreThreshold,
    recallQueryExpansion,
    recallCompress,
    commitTokenThreshold,
    commitKeepRecentCount,
    idleTtlMs,
    timeoutMs,
    debug,
    stateDir,
    pendingDir,
    debugLogPath,
    userAgent,
    sessionPrefix,
    actorPeerId,
    cliConfigFile,
  };
}
