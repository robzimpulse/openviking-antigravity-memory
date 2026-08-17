import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { enqueue, listPending, replayPending } from "../../scripts/shared/pending-queue.mjs";

describe("offline queue and replay", () => {
  let tempDir;
  const originalPendingDir = process.env.OPENVIKING_PENDING_DIR;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ag-pending-test-"));
    process.env.OPENVIKING_PENDING_DIR = tempDir;
  });

  after(async () => {
    if (originalPendingDir) {
      process.env.OPENVIKING_PENDING_DIR = originalPendingDir;
    } else {
      delete process.env.OPENVIKING_PENDING_DIR;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("enqueues failed operation to pending queue on disk", async () => {
    const payload = { role: "user", content: "offline message test" };
    const res = await enqueue("addMessage", "ag-test-session-offline", payload);
    assert.ok(res.ok, "Enqueue should succeed");

    const list = await listPending();
    assert.equal(list.length, 1);
    assert.equal(list[0].entry.type, "addMessage");
    assert.equal(list[0].entry.sessionId, "ag-test-session-offline");
  });

  it("replays pending queue when mock fetch succeeds", async () => {
    const mockFetchJSON = async () => ({ ok: true, status: 200 });
    const log = () => {};

    const replayRes = await replayPending(mockFetchJSON, log);
    assert.equal(replayRes.replayed, 1);

    const listAfter = await listPending();
    assert.equal(listAfter.length, 0, "Queue should be empty after successful replay");
  });
});
