import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTranscriptLines,
  extractLatestUserPrompt,
  extractCaptureTurnsFromTranscript,
  computeTurnHash,
} from "../../scripts/antigravity-transcript.mjs";

describe("antigravity-transcript", () => {
  it("parses valid JSON lines and ignores malformed ones", () => {
    const raw = `
{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"Hello world"}
not-a-json-line
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"Hi there"}
`;
    const records = parseTranscriptLines(raw);
    assert.equal(records.length, 2);
    assert.equal(records[0].step_index, 0);
    assert.equal(records[1].step_index, 1);
  });

  it("extracts latest user prompt correctly, handling out of order records", () => {
    const raw = `
{"step_index":2,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"Second question"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"First answer"}
{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"First question"}
`;
    const records = parseTranscriptLines(raw);
    const latest = extractLatestUserPrompt(records, "conv-123");
    assert.ok(latest);
    assert.equal(latest.stepIndex, 2);
    assert.equal(latest.content, "Second question");
    assert.ok(latest.hash);
  });

  it("excludes thinking, tool calls, checkpoints, and system messages from capture", () => {
    const raw = `
{"step_index":0,"source":"SYSTEM","type":"CONVERSATION_HISTORY","status":"DONE"}
{"step_index":1,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"Please check the server"}
{"step_index":2,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","thinking":"I should check","tool_calls":[{"name":"run_command","args":{"CommandLine":"uptime"}}]}
{"step_index":3,"source":"MODEL","type":"RUN_COMMAND","status":"DONE","content":"load average: 0.15"}
{"step_index":4,"source":"SYSTEM","type":"CHECKPOINT","status":"DONE","content":"checkpoint data"}
{"step_index":5,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"The server load average is 0.15, everything is normal."}
`;
    const records = parseTranscriptLines(raw);
    const turns = extractCaptureTurnsFromTranscript(records, "conv-123");
    
    assert.equal(turns.length, 2);
    assert.equal(turns[0].role, "user");
    assert.equal(turns[0].content, "Please check the server");
    assert.equal(turns[1].role, "assistant");
    assert.equal(turns[1].content, "The server load average is 0.15, everything is normal.");
  });

  it("produces deterministic turn hashes", () => {
    const h1 = computeTurnHash("c1", 5, "user", "Test message");
    const h2 = computeTurnHash("c1", 5, "user", "Test message");
    const h3 = computeTurnHash("c1", 6, "user", "Test message");
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
  });
});
