/**
 * Management routes on the fail-open MANAGEMENT tier must not hand out stored credentials in
 * plaintext: with login disabled they answer anonymous callers, and otherwise any manage-scoped
 * key. Covers the translator request preview (step 4), the CLI-tools key listing and the
 * settings GET/PATCH payload.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-mgmt-cred-disclosure-"));
const ORIGINAL_ENV = {
  DATA_DIR: process.env.DATA_DIR,
  API_KEY_SECRET: process.env.API_KEY_SECRET,
  INITIAL_PASSWORD: process.env.INITIAL_PASSWORD,
  DISABLE_SQLITE_AUTO_BACKUP: process.env.DISABLE_SQLITE_AUTO_BACKUP,
};
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";
process.env.API_KEY_SECRET = "mgmt-cred-disclosure-api-key-secret";
delete process.env.INITIAL_PASSWORD;

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("unexpected external call");
};

const core = await import("../../src/lib/db/core.ts");
const providers = await import("../../src/lib/db/providers.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const translateRoute = await import("../../src/app/api/translator/translate/route.ts");
const keysRoute = await import("../../src/app/api/cli-tools/keys/route.ts");
const settingsRoute = await import("../../src/app/api/settings/route.ts");

test.after(() => {
  globalThis.fetch = originalFetch;
  try {
    apiKeysDb.resetApiKeyState?.();
  } catch {}
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

// Open mode: login disabled, anonymous callers reach the MANAGEMENT tier.
await settingsDb.updateSettings({ requireLogin: false });

test("translator step 4 redacts the upstream credential headers", async () => {
  const upstreamKey = "sk-live-upstream-secret-0123456789abcdef";
  await providers.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "translator-preview",
    apiKey: upstreamKey,
    isActive: true,
    testStatus: "active",
    priority: 1,
    providerSpecificData: {},
  });

  const response = await translateRoute.POST(
    new Request("http://localhost/api/translator/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        step: 4,
        provider: "openai",
        body: { model: "gpt-4.1-mini", messages: [{ role: "user", content: "hi" }] },
      }),
    })
  );
  const raw = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!raw.includes(upstreamKey), "upstream key must not appear in the preview");

  const { result } = JSON.parse(raw) as { result: { headers: Record<string, string> } };
  const authHeader = Object.entries(result.headers).find(
    ([name]) => name.toLowerCase() === "authorization"
  );
  assert.ok(authHeader, "the header is still listed so the preview shows its shape");
  assert.match(authHeader[1], /REDACTED/);
});

test("cli-tools keys listing withholds rawKey from anonymous callers in open mode", async () => {
  const victim = await apiKeysDb.createApiKey("victim-admin", "machine-disclosure", ["admin"]);
  const response = await keysRoute.GET(new Request("http://localhost/api/cli-tools/keys"));
  const raw = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!raw.includes(victim.key), "plaintext key must not appear anywhere in the body");
});

test("settings GET and PATCH do not return stored secrets", async () => {
  const secrets = {
    oidcClientSecret: "oidc-client-secret-value-123",
    qdrantApiKey: "qdrant-api-key-value-456",
    deepHealthToken: "deep-health-token-value-789",
  };
  await settingsDb.updateSettings(secrets);

  const getResponse = await settingsRoute.GET(new Request("http://localhost/api/settings"));
  const getRaw = await getResponse.text();
  assert.equal(getResponse.status, 200);
  for (const value of Object.values(secrets)) {
    assert.ok(!getRaw.includes(value), `GET leaked ${value}`);
  }

  const patchResponse = await settingsRoute.PATCH(
    new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hideHealthCheckLogs: true }),
    })
  );
  const patchRaw = await patchResponse.text();
  assert.equal(patchResponse.status, 200, patchRaw);
  for (const value of Object.values(secrets)) {
    assert.ok(!patchRaw.includes(value), `PATCH leaked ${value}`);
  }

  // The stored secrets are untouched.
  const stored = await settingsDb.getSettings();
  assert.equal(stored.oidcClientSecret, secrets.oidcClientSecret);
  assert.equal(stored.qdrantApiKey, secrets.qdrantApiKey);
  assert.equal(stored.deepHealthToken, secrets.deepHealthToken);
});
