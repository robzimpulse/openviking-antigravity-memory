import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const TENANT_KEYS_PATH = "/home/vladimir/AI/LocalAI/pro-local-ai-setup/openviking/runtime/tenant-keys.json";
const BASE_URL = "http://127.0.0.1:1933";

describe("identity isolation test", () => {
  it("proves fallback 'antigravity' key cannot access 'vladimir-dev' private user memories", async () => {
    const raw = await readFile(TENANT_KEYS_PATH, "utf-8");
    const tenantData = JSON.parse(raw);

    const devKey = tenantData.accounts?.["home-coding"]?.users?.["vladimir-dev"]?.api_key;
    const agKey = tenantData.accounts?.["home-coding"]?.users?.["antigravity"]?.api_key;

    assert.ok(devKey, "vladimir-dev API key must exist in tenant registry");
    assert.ok(agKey, "antigravity API key must exist in tenant registry");

    // 1. Check system status with vladimir-dev key
    const devStatusRes = await fetch(`${BASE_URL}/api/v1/system/status`, {
      headers: {
        Authorization: `Bearer ${devKey}`,
        "X-OpenViking-Account": "home-coding",
        "X-OpenViking-User": "vladimir-dev",
      },
    });
    assert.ok(devStatusRes.ok, "vladimir-dev status check should succeed");

    // 2. Check system status with fallback antigravity key
    const agStatusRes = await fetch(`${BASE_URL}/api/v1/system/status`, {
      headers: {
        Authorization: `Bearer ${agKey}`,
        "X-OpenViking-Account": "home-coding",
        "X-OpenViking-User": "antigravity",
      },
    });
    assert.ok(agStatusRes.ok, "antigravity fallback status check should succeed");

    // 3. Verify that antigravity user space is isolated from vladimir-dev
    const agLsRes = await fetch(`${BASE_URL}/api/v1/fs/ls?uri=${encodeURIComponent("viking://user/vladimir-dev")}`, {
      headers: {
        Authorization: `Bearer ${agKey}`,
        "X-OpenViking-Account": "home-coding",
        "X-OpenViking-User": "antigravity",
      },
    });
    // Fallback key should either receive 403 Forbidden, 404 Not Found, or empty result, isolating vladimir-dev
    if (agLsRes.ok) {
      const data = await agLsRes.json();
      const files = Array.isArray(data.result) ? data.result : [];
      assert.equal(files.length, 0, "antigravity user must not see vladimir-dev private files");
    } else {
      assert.ok(agLsRes.status === 403 || agLsRes.status === 404 || agLsRes.status === 400);
    }
  });
});
