import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveWorkspacePeerId, resolveEffectivePeerId } from "../../scripts/shared/workspace-peer.mjs";
import { deriveHarnessSessionId } from "../../scripts/shared/session-model.mjs";

describe("session & peer derivation", () => {
  it("derives valid session IDs with ag- prefix", () => {
    const sid = deriveHarnessSessionId("ag-", "b1e19e73-d4d4-4ea2-863b-f40bb1f5332f");
    assert.equal(sid, "ag-b1e19e73-d4d4-4ea2-863b-f40bb1f5332f");
  });

  it("derives workspace peer id deterministically", () => {
    const peerId = deriveWorkspacePeerId("/home/vladimir/AI/LocalAI");
    assert.equal(peerId, "-home-vladimir-AI-LocalAI");
  });

  it("resolves explicit peer ID when specified", () => {
    const res = resolveEffectivePeerId({
      cfg: { peerId: "antigravity" },
      cwd: "/home/vladimir",
    });
    assert.equal(res.peerId, "antigravity");
    assert.equal(res.source, "explicit");
  });
});
