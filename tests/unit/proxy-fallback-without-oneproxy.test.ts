import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The free proxy pool (1proxy marketplace + free-proxy providers) was removed from 67router.
// The proxy registry must keep resolving a connection's proxy, and the automatic fallback
// must keep offering registry proxies as candidates.
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-proxy-no-oneproxy-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "test-secret";

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const proxiesDb = await import("../../src/lib/db/proxies.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const { getProxyCandidates, clearProxyFallbackCache } =
  await import("../../open-sse/utils/proxyFallback.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("a registry proxy assigned to a connection still resolves and is a fallback candidate", async () => {
  const conn = await providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "registry-keep",
    apiKey: "sk-test",
  });
  const proxy = await proxiesDb.createProxy({
    name: "Kept Registry Proxy",
    type: "http",
    host: "registry-keep.local",
    port: 8181,
  });
  const connectionId = String((conn as { id: string }).id);
  await proxiesDb.assignProxyToScope("account", connectionId, proxy.id);

  const resolved = (await settingsDb.resolveProxyForConnection(connectionId)) as {
    source?: string;
    proxy?: { host?: string };
  } | null;
  assert.equal(resolved?.source, "registry");
  assert.equal(resolved?.proxy?.host, "registry-keep.local");

  clearProxyFallbackCache();
  const candidates = await getProxyCandidates("https://api.openai.com/v1/models");
  assert.ok(
    candidates.some((url) => url.includes("registry-keep.local:8181")),
    `registry proxy missing from fallback candidates: ${candidates.join(", ")}`
  );
});
