/**
 * Video/music routes price each successful call
 * (`calculateModalCost`) for the X-OmniRoute cost header and also record the
 * metered share of that cost in the key's cost history, like chat does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-budget-modal-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "budget-modal-routes-secret";

const core = await import("../../src/lib/db/core.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const { saveSyncedPricing } = await import("../../src/lib/pricingSync.ts");
const { waitForCallLogSaves } = await import("../../src/lib/usage/callLogs.ts");
const costRules = await import("../../src/domain/costRules.ts");
const mediaRoute = await import("../../src/app/api/v1/_shared/mediaGenerationRoute.ts");

const originalFetch = globalThis.fetch;

async function resetStorage() {
  await waitForCallLogSaves(10_000);
  globalThis.fetch = originalFetch;
  costRules.resetCostData();
  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(async () => {
  await waitForCallLogSaves(10_000);
  globalThis.fetch = originalFetch;
  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function createMediaKey() {
  const created = await apiKeysDb.createApiKey("Media key", "machine-budget-modal");
  apiKeysDb.clearApiKeyCaches();
  return created;
}

function spent(apiKeyId: string): number {
  return costRules.getDailyTotal(apiKeyId);
}

test("video/music responses record the cost of the key they were made for", async () => {
  saveSyncedPricing({
    openai: { "sora-test": { input: 0, output: 0, output_cost_per_video_per_second: 0.1 } },
  });
  const key = await createMediaKey();
  const response = await mediaRoute.successfulMediaGenerationResponse({
    result: { data: { ok: true } },
    billingMode: "video",
    provider: "openai",
    model: "openai/sora-test",
    startTime: Date.now(),
    duration: 4,
    apiKeyId: key.id,
  });
  assert.equal(response.status, 200);
  assert.ok(Math.abs(spent(key.id) - 0.4) < 1e-9, `expected $0.4 charged, got ${spent(key.id)}`);
});

test("recordModalCallCost: flat-rate providers, zero costs and keyless calls charge nothing", async () => {
  const key = await createMediaKey();
  costRules.recordModalCallCost(key.id, { provider: "opencode-go", model: "m", costUsd: 3 });
  costRules.recordModalCallCost(key.id, { provider: "openai", model: "m", costUsd: 0 });
  costRules.recordModalCallCost(null, { provider: "openai", model: "m", costUsd: 3 });
  assert.equal(spent(key.id), 0);
  costRules.recordModalCallCost(key.id, { provider: "openai", model: "m", costUsd: 0.75 });
  assert.ok(Math.abs(spent(key.id) - 0.75) < 1e-9);
});
