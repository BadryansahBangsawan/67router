/**
 * tests/unit/apikeys-retired-quota-scope.test.ts
 *
 * Quota Share was removed, but the `api_keys.allowed_quotas` column stays and
 * older installs may still hold quota-exclusive keys (allowed_quotas = '["pool-1"]').
 * Such a key used to be limited to its pool's qtSd/* models and connections. With
 * the pool engine gone it must fail CLOSED (refused), never fall back to an
 * unrestricted key. A key with the default '[]' is unaffected.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-retired-quota-scope-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "retired-quota-scope-test-secret";

const coreDb = await import("../../src/lib/db/core.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const rateLimiter = await import("../../src/shared/utils/rateLimiter.ts");
const policy = await import("../../src/shared/utils/apiKeyPolicy.ts");
const upstreamScope = await import("../../src/shared/utils/apiKeyUpstreamScope.ts");

rateLimiter.setRateLimiterTestMode(true);

function setAllowedQuotas(keyId: string, value: string) {
  // Simulates a row written before Quota Share was removed (no writer exists any more).
  coreDb
    .getDbInstance()
    .prepare("UPDATE api_keys SET allowed_quotas = ? WHERE id = ?")
    .run(value, keyId);
  apiKeysDb.clearApiKeyCaches();
}

function chatRequest(apiKey: string) {
  return new Request("http://localhost/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

test.after(() => {
  apiKeysDb.resetApiKeyState();
  coreDb.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("a key still carrying a Quota Share allocation is refused (fail closed)", async () => {
  const created = await apiKeysDb.createApiKey("Legacy quota key", "machine-legacy-quota");
  setAllowedQuotas(created.id, JSON.stringify(["pool-1"]));

  assert.equal(await apiKeysDb.validateApiKey(created.key), false, "auth must refuse the key");

  const result = await policy.enforceApiKeyPolicy(chatRequest(created.key), "openai/gpt-4o");
  assert.ok(result.rejection, "policy must reject the key");
  assert.equal(result.rejection.status, 403);
  const body = (await result.rejection.json()) as { error: { message: string } };
  assert.match(body.error.message, /Quota Share/);

  const scope = await upstreamScope.resolveApiKeyUpstreamScope(
    chatRequest(created.key),
    "openai/gpt-4o",
    { provider: "openai", model: "gpt-4o" }
  );
  assert.equal(scope.permitted, false, "side paths must not borrow an upstream for the key");
});

test("an unparseable allowed_quotas value also fails closed", async () => {
  const created = await apiKeysDb.createApiKey("Corrupt quota key", "machine-corrupt-quota");
  setAllowedQuotas(created.id, "not-json");

  assert.equal(await apiKeysDb.validateApiKey(created.key), false);
  const result = await policy.enforceApiKeyPolicy(chatRequest(created.key), "openai/gpt-4o");
  assert.equal(result.rejection?.status, 403);
});

test("a key with the default empty allocation keeps working", async () => {
  const created = await apiKeysDb.createApiKey("Plain key", "machine-plain");
  setAllowedQuotas(created.id, "[]");

  assert.equal(await apiKeysDb.validateApiKey(created.key), true);
  const result = await policy.enforceApiKeyPolicy(chatRequest(created.key), "openai/gpt-4o");
  assert.equal(result.rejection, null);
});
