import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLogger } from "../../scripts/shared/debug-log.mjs";

describe("redaction & logging safety", () => {
  let tempDir;
  let logPath;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ag-redact-test-"));
    logPath = join(tempDir, "hooks.jsonl");
  });

  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write sensitive API keys to log file", async () => {
    const logger = createLogger("test-scope", {
      debug: true,
      debugLogPath: logPath,
      apiKey: "secret-super-key-12345",
      account: "home-coding",
      user: "vladimir-dev",
    });

    logger.log("test_event", {
      status: "ok",
      user: "vladimir-dev",
      account: "home-coding",
    });

    const content = await readFile(logPath, "utf-8");
    assert.ok(!content.includes("secret-super-key-12345"), "API key must not appear in log file");
    assert.ok(content.includes("test_event"));
  });
});
