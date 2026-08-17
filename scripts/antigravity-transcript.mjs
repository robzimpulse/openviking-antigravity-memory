import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sanitizeCapturedText, shouldCaptureText } from "./shared/capture-utils.mjs";

export function computeTurnHash(conversationId, stepIndex, role, content) {
  return createHash("sha256")
    .update(String(conversationId || ""))
    .update("\n")
    .update(String(stepIndex !== undefined && stepIndex !== null ? stepIndex : ""))
    .update("\n")
    .update(String(role || "").toLowerCase())
    .update("\n")
    .update(String(content || "").trim())
    .digest("hex");
}

export function parseTranscriptLines(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  const lines = rawText.split(/\r?\n/);
  const records = [];
  let fileIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    fileIndex++;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") {
        records.push({ ...obj, _fileIndex: fileIndex });
      }
    } catch {
      // Ignore malformed JSON lines defensively
    }
  }

  return records;
}

export async function readTranscriptFile(filePath) {
  if (!filePath) return [];
  try {
    const text = await readFile(filePath, "utf-8");
    return parseTranscriptLines(text);
  } catch {
    return [];
  }
}

/**
 * Find the latest active user prompt from parsed transcript records.
 * Selects the latest completed USER_INPUT record with source == "USER_EXPLICIT" and non-empty content.
 */
export function extractLatestUserPrompt(records, conversationId = "") {
  if (!Array.isArray(records) || records.length === 0) return null;

  const userRecords = records.filter((r) => {
    if (r.type !== "USER_INPUT") return false;
    if (r.source !== "USER_EXPLICIT") return false;
    if (r.status && r.status !== "DONE") return false;
    const content = typeof r.content === "string" ? r.content.trim() : "";
    return Boolean(content);
  });

  if (userRecords.length === 0) return null;

  // Sort by step_index if numeric, else fallback to file order
  userRecords.sort((a, b) => {
    const aIdx = Number(a.step_index);
    const bIdx = Number(b.step_index);
    if (Number.isFinite(aIdx) && Number.isFinite(bIdx)) {
      return aIdx - bIdx;
    }
    return (a._fileIndex || 0) - (b._fileIndex || 0);
  });

  const latest = userRecords[userRecords.length - 1];
  const stepIndex = latest.step_index !== undefined ? Number(latest.step_index) : latest._fileIndex;
  const rawContent = String(latest.content || "");
  const sanitized = sanitizeCapturedText(rawContent);
  const hash = computeTurnHash(conversationId, stepIndex, "user", sanitized);

  return {
    stepIndex,
    rawContent,
    content: sanitized,
    hash,
    createdAt: latest.created_at,
  };
}

/**
 * Extract clean user and final assistant turns for memory capture.
 * Excludes thinking, tool calls, tool results, checkpoints, system messages.
 */
export function extractCaptureTurnsFromTranscript(records, conversationId = "", cfg = {}) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // Filter candidate records
  const candidates = [];

  for (const r of records) {
    if (r.status && r.status !== "DONE") continue;

    // User input
    if (r.type === "USER_INPUT" && r.source === "USER_EXPLICIT") {
      const content = typeof r.content === "string" ? r.content.trim() : "";
      if (!content) continue;
      const stepIndex = r.step_index !== undefined ? Number(r.step_index) : r._fileIndex;
      candidates.push({
        role: "user",
        stepIndex,
        fileIndex: r._fileIndex || 0,
        rawContent: content,
        createdAt: r.created_at,
      });
    }

    // Assistant response (only completed responses without tool calls)
    if (r.type === "PLANNER_RESPONSE" && r.source === "MODEL") {
      const toolCalls = Array.isArray(r.tool_calls) ? r.tool_calls : [];
      if (toolCalls.length > 0) continue; // Skip planner responses that execute tools

      const content = typeof r.content === "string" ? r.content.trim() : "";
      if (!content) continue; // Skip empty content

      const stepIndex = r.step_index !== undefined ? Number(r.step_index) : r._fileIndex;
      candidates.push({
        role: "assistant",
        stepIndex,
        fileIndex: r._fileIndex || 0,
        rawContent: content,
        createdAt: r.created_at,
      });
    }
  }

  // Sort by stepIndex numerically with fileIndex fallback
  candidates.sort((a, b) => {
    if (Number.isFinite(a.stepIndex) && Number.isFinite(b.stepIndex)) {
      if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
    }
    return a.fileIndex - b.fileIndex;
  });

  // Sanitize and filter with capture rules
  const turns = [];
  for (const item of candidates) {
    const decision = shouldCaptureText(item.rawContent, item.role, cfg);
    if (!decision.shouldCapture) continue;

    const hash = computeTurnHash(conversationId, item.stepIndex, item.role, decision.text);
    turns.push({
      role: item.role,
      content: decision.text,
      stepIndex: item.stepIndex,
      hash,
      createdAt: item.createdAt,
    });
  }

  return turns;
}
