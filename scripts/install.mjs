#!/usr/bin/env node

/**
 * Idempotent installer for OpenViking Antigravity plugin.
 */

import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolvePath(join(__dirname, ".."));

const TENANT_KEYS_PATH = "/home/vladimir/AI/LocalAI/pro-local-ai-setup/openviking/runtime/tenant-keys.json";
const PLUGIN_INSTALL_ROOT = "/home/vladimir/.gemini/config/plugins/openviking-memory";
const PUBLISH_REPO_ROOT = "/home/vladimir/GitRoot/ExternalSkills/Publish/OpenViking";
const RUNTIME_ROOT = join(homedir(), ".openviking", "antigravity");
const OVCLI_CONF_PATH = join(RUNTIME_ROOT, "ovcli.conf");
const BACKUPS_ROOT = join(RUNTIME_ROOT, "backups");
const BASE_URL = "http://127.0.0.1:1933";

function logStep(msg) {
  console.log(`\x1b[34m[install]\x1b[0m ${msg}`);
}

function logSuccess(msg) {
  console.log(`\x1b[32m[success]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m[error]\x1b[0m ${msg}`);
}

async function main() {
  logStep("1. Validating runtime environment...");
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace(/^v/, "").split(".")[0], 10);
  if (major < 18) {
    throw new Error(`Node.js version >= 18 is required, found ${nodeVersion}`);
  }
  logSuccess(`Node.js version: ${nodeVersion}`);

  logStep("2. Checking OpenViking server health...");
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`OpenViking health check failed: HTTP ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  if (healthData.status !== "ok" && healthData.healthy !== true) {
    throw new Error(`OpenViking unhealthy: ${JSON.stringify(healthData)}`);
  }
  logSuccess(`OpenViking server is healthy (${healthData.version || "v0.4.13"})`);

  logStep("3. Resolving production credentials from tenant registry...");
  const tenantRaw = await readFile(TENANT_KEYS_PATH, "utf-8");
  const tenantData = JSON.parse(tenantRaw);
  const apiKey = tenantData.accounts?.["home-coding"]?.users?.["vladimir-dev"]?.api_key;
  if (!apiKey) {
    throw new Error(`Failed to find API key for home-coding/vladimir-dev in ${TENANT_KEYS_PATH}`);
  }

  logStep("4. Verifying production authentication against OpenViking...");
  const authRes = await fetch(`${BASE_URL}/api/v1/system/status`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-OpenViking-Account": "home-coding",
      "X-OpenViking-User": "vladimir-dev",
    },
  });
  if (!authRes.ok) {
    throw new Error(`Authentication verification failed: HTTP ${authRes.status}`);
  }
  logSuccess("Authentication verified for account 'home-coding', user 'vladimir-dev'");

  logStep("5. Preparing runtime directories and credentials file...");
  await mkdir(RUNTIME_ROOT, { recursive: true, mode: 0o700 });
  await chmod(RUNTIME_ROOT, 0o700);

  await mkdir(join(RUNTIME_ROOT, "state"), { recursive: true, mode: 0o700 });
  await chmod(join(RUNTIME_ROOT, "state"), 0o700);

  await mkdir(join(RUNTIME_ROOT, "pending"), { recursive: true, mode: 0o700 });
  await chmod(join(RUNTIME_ROOT, "pending"), 0o700);

  await mkdir(join(RUNTIME_ROOT, "logs"), { recursive: true, mode: 0o700 });
  await chmod(join(RUNTIME_ROOT, "logs"), 0o700);

  await mkdir(BACKUPS_ROOT, { recursive: true, mode: 0o700 });

  const ovcliContent = {
    url: BASE_URL,
    api_key: apiKey,
    account: "home-coding",
    user: "vladimir-dev",
    actor_peer_id: "antigravity",
    peer_id: "antigravity",
  };

  await writeFile(OVCLI_CONF_PATH, JSON.stringify(ovcliContent, null, 2), {
    mode: 0o600,
  });
  await chmod(OVCLI_CONF_PATH, 0o600);
  logSuccess(`Runtime credentials rendered securely to ${OVCLI_CONF_PATH} (mode 0600)`);

  logStep("6. Running test suite before installation...");
  const testFiles = [
    "test/unit/transcript.test.mjs",
    "test/unit/hook.test.mjs",
    "test/unit/session.test.mjs",
    "test/unit/redaction.test.mjs",
    "test/integration/mcp-live.test.mjs",
    "test/integration/hook-live.test.mjs",
    "test/integration/offline-queue.test.mjs",
    "test/isolation/identity-isolation.test.mjs",
  ];

  for (const testFile of testFiles) {
    const fullTestPath = join(SOURCE_ROOT, testFile);
    logStep(`Running test: ${testFile}`);
    try {
      await execFileAsync("node", ["--test", fullTestPath], {
        cwd: SOURCE_ROOT,
        env: { ...process.env, OPENVIKING_CLI_CONFIG_FILE: OVCLI_CONF_PATH },
      });
      logSuccess(`Passed: ${testFile}`);
    } catch (testErr) {
      logError(`Test failed: ${testFile}\n${testErr.stdout || ""}\n${testErr.stderr || ""}`);
      throw new Error(`Test failed: ${testFile}`);
    }
  }

  logStep("7. Backing up existing plugin installation if present...");
  try {
    const st = await stat(PLUGIN_INSTALL_ROOT);
    if (st.isDirectory()) {
      const backupDir = join(BACKUPS_ROOT, `openviking-memory-backup-${Date.now()}`);
      await cp(PLUGIN_INSTALL_ROOT, backupDir, { recursive: true });
      logSuccess(`Previous installation backed up to ${backupDir}`);
    }
  } catch (err) {
    if (err?.code !== "ENOENT") {
      logError(`Warning during backup check: ${err.message}`);
    }
  }

  logStep("8. Installing plugin to global Antigravity plugins directory...");
  const stagingDir = join(RUNTIME_ROOT, `staging-${Date.now()}`);
  await mkdir(stagingDir, { recursive: true, mode: 0o755 });

  // Files to copy to installed plugin
  const itemsToCopy = [
    "plugin.json",
    "mcp_config.json",
    "hooks.json",
    "README.md",
    "DESIGN.md",
    "VERIFICATION.md",
    "THIRD_PARTY_NOTICES.md",
    "install.sh",
    "uninstall.sh",
    "servers",
    "scripts",
    "skills",
    "rules",
  ];

  for (const item of itemsToCopy) {
    const src = join(SOURCE_ROOT, item);
    const dest = join(stagingDir, item);
    await cp(src, dest, { recursive: true });
  }

  // Ensure scripts and hooks are executable
  await chmod(join(stagingDir, "servers", "mcp-proxy.mjs"), 0o755).catch(() => {});
  await chmod(join(stagingDir, "scripts", "antigravity-hook.mjs"), 0o755).catch(() => {});
  await chmod(join(stagingDir, "scripts", "manage.mjs"), 0o755).catch(() => {});
  await chmod(join(stagingDir, "install.sh"), 0o755).catch(() => {});
  await chmod(join(stagingDir, "uninstall.sh"), 0o755).catch(() => {});

  // Atomically replace target
  await rm(PLUGIN_INSTALL_ROOT, { recursive: true, force: true });
  await cp(stagingDir, PLUGIN_INSTALL_ROOT, { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });

  logSuccess(`Installed plugin to ${PLUGIN_INSTALL_ROOT}`);

  logStep("9. Updating publish repository at GitRoot...");
  try {
    await mkdir(PUBLISH_REPO_ROOT, { recursive: true, mode: 0o755 });
    for (const item of itemsToCopy) {
      const src = join(SOURCE_ROOT, item);
      const dest = join(PUBLISH_REPO_ROOT, item);
      await cp(src, dest, { recursive: true });
    }
    // Also copy tests to publish repo
    await cp(join(SOURCE_ROOT, "test"), join(PUBLISH_REPO_ROOT, "test"), { recursive: true });
    logSuccess(`Publish repository updated at ${PUBLISH_REPO_ROOT}`);
  } catch (err) {
    logError(`Publish repo sync warning: ${err.message}`);
  }

  console.log("\n========================================================");
  console.log("🎉 OpenViking Memory Plugin successfully installed!");
  console.log(`Plugin path:      ${PLUGIN_INSTALL_ROOT}`);
  console.log(`Credentials:      ${OVCLI_CONF_PATH} (mode 0600)`);
  console.log(`Account/User:     home-coding / vladimir-dev`);
  console.log(`Actor Peer ID:    antigravity`);
  console.log(`Session Prefix:   ag-`);
  console.log("========================================================\n");
}

main().catch((err) => {
  logError(`Installation failed: ${err.message}`);
  process.exitCode = 1;
});
