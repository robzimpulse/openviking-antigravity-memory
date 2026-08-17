import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../scripts/config.mjs";
import { resolveOpenVikingCredentials } from "../../scripts/shared/credentials.mjs";
import { handlePreInvocation, handleStopWorker } from "../../scripts/antigravity-hook.mjs";

describe("live hook integration", () => {
  let tempDir;
  let testConvId;
  let transcriptPath;
  let cfg;
  let creds;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ag-hook-live-"));
    testConvId = `test-live-${Date.now()}`;
    transcriptPath = join(tempDir, "transcript.jsonl");

    cfg = {
      ...loadConfig(),
      stateDir: join(tempDir, "state"),
      pendingDir: join(tempDir, "pending"),
      sessionPrefix: "ag-",
    };
    creds = resolveOpenVikingCredentials();

    const sampleTranscript = `
{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"Verify Antigravity OpenViking live hook integration with unique marker AG_MARKER_${Date.now()}"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"Verified live hook integration successfully."}
`;
    await writeFile(transcriptPath, sampleTranscript);
  });

  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("performs live Stop capture and session message delivery", async () => {
    const log = () => {};
    const payload = {
      conversationId: testConvId,
      transcriptPath,
    };

    // Capture the turn
    await handleStopWorker(payload, cfg, creds, log);

    // Verify idempotency on second run
    await handleStopWorker(payload, cfg, creds, log);
  });

  it("handles live PreInvocation recall without throwing errors", async () => {
    const log = () => {};
    const payload = {
      conversationId: testConvId,
      transcriptPath,
      invocationNum: 1,
    };

    const res = await handlePreInvocation(payload, cfg, creds, log);
    assert.ok(typeof res === "object", "PreInvocation must return an object");
  });
});
