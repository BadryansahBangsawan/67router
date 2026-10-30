/**
 * `/v1/moderations` was removed from 67router, so `/v1/models` must not advertise
 * moderation models: a client picking `openai/omni-moderation-latest` from the
 * catalog would only get a 404.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-no-moderation-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const v1ModelsCatalog = await import("../../src/app/api/v1/models/catalog.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("/v1/models lists no moderation-type models", async () => {
  // openai and mistral both carry moderation models in the registry.
  for (const provider of ["openai", "mistral"]) {
    await providersDb.createProviderConnection({
      provider,
      authType: "apikey",
      name: `${provider}-main`,
      apiKey: "sk-test",
      isActive: true,
    });
  }

  const res = await v1ModelsCatalog.getUnifiedModelsResponse(
    new Request("http://localhost/api/v1/models", { method: "GET" })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<{ id: string; type?: string }> };

  assert.ok(body.data.length > 0, "catalog should not be empty");
  const moderation = body.data.filter((m) => m.type === "moderation").map((m) => m.id);
  assert.deepEqual(moderation, [], `moderation models still listed: ${moderation.join(", ")}`);
});
