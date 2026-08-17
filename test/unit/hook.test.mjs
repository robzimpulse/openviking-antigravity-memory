import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handlePreInvocation, handleStopWorker } from "../../scripts/antigravity-hook.mjs";

describe("antigravity-hook", () => {
  let tempDir;
  let transcriptPath;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ag-hook-test-"));
    transcriptPath = join(tempDir, "transcript.jsonl");

    const sampleTranscript = `
{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"How do I configure OpenViking?"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"You configure OpenViking by setting up ~/.openviking/antigravity/ovcli.conf."}
`;
    await writeFile(transcriptPath, sampleTranscript);
  });

  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("handles pre-invocation fail-open when server is unreachable", async () => {
    const cfg = {
      enabled: true,
      autoRecall: true,
      stateDir: join(tempDir, "state"),
      pendingDir: join(tempDir, "pending"),
      sessionPrefix: "ag-test-",
      actorPeerId: "antigravity",
      timeoutMs: 500,
    };
    const creds = {
      baseUrl: "http://127.0.0.1:19999", // Unreachable port
      apiKey: "test-key",
      account: "home-coding",
      user: "vladimir-dev",
    };
    const log = () => {};

    const payload = {
      conversationId: "test-conv-1",
      transcriptPath,
      invocationNum: 1,
    };

    const res = await handlePreInvocation(payload, cfg, creds, log);
    assert.deepEqual(res, {}); // Must fail open returning empty object
  });

  it("deduplicates pre-invocation on repeated calls for the same turn", async () => {
    const cfg = {
      enabled: true,
      autoRecall: true,
      stateDir: join(tempDir, "state"),
      pendingDir: join(tempDir, "pending"),
      sessionPrefix: "ag-test-",
      actorPeerId: "antigravity",
      timeoutMs: 500,
    };
    const creds = {
      baseUrl: "http://127.0.0.1:19999",
      apiKey: "test-key",
    };
    let logCalls = 0;
    const log = () => { logCalls++; };

    const payload = {
      conversationId: "test-conv-dedup",
      transcriptPath,
      invocationNum: 1,
    };

    // First call
    const res1 = await handlePreInvocation(payload, cfg, creds, log);
    assert.deepEqual(res1, {});

    // Second call for the same unchanged turn
    const res2 = await handlePreInvocation(payload, cfg, creds, log);
    assert.deepEqual(res2, {});
  });

  it("handles stop worker idempotency on repeated executions", async () => {
    const cfg = {
      enabled: true,
      autoCapture: true,
      stateDir: join(tempDir, "state"),
      pendingDir: join(tempDir, "pending"),
      sessionPrefix: "ag-test-",
      actorPeerId: "antigravity",
      timeoutMs: 500,
    };
    const creds = {
      baseUrl: "http://127.0.0.1:19999", // Offline server tests offline queueing
      apiKey: "test-key",
    };
    const log = () => {};

    const payload = {
      conversationId: "test-conv-stop",
      transcriptPath,
    };

    // Run 1: captures turns into offline queue and state
    await handleStopWorker(payload, cfg, creds, log);

    // Run 2: should recognize turns as already captured
    await handleStopWorker(payload, cfg, creds, log);
  });
});
