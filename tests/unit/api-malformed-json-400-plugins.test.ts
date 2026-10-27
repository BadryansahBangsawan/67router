/**
 * Regression tests: POST /api/plugins must return 400 (not an unhandled error) on a
 * malformed JSON request body.
 *
 * Before the fix the handler called `await request.json()` with no try/catch, so a
 * body that is not JSON made the handler reject instead of answering. A malformed body
 * must surface as a clean 400, while a well-formed body keeps its existing behavior.
 *
 * DB setup mirrors tests/unit/api-malformed-json-400.test.ts: a temp DATA_DIR with no
 * configured password, so POST /api/plugins needs no login. DB handles are released in
 * test.after (resetDbInstance), as unreleased SQLite handles hang the runner.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-malformed-json-plugins-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;
const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET ?? "malformed-json-plugins-test-secret";
delete process.env.INITIAL_PASSWORD;

const core = await import("../../src/lib/db/core.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const pluginsRoute = await import("../../src/app/api/plugins/route.ts");

function jsonRequest(url: string, method: string, body: string): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

test.after(() => {
  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_API_KEY_SECRET === undefined) delete process.env.API_KEY_SECRET;
  else process.env.API_KEY_SECRET = ORIGINAL_API_KEY_SECRET;
  if (ORIGINAL_INITIAL_PASSWORD !== undefined)
    process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
});

test("POST /api/plugins — malformed JSON body returns 400", async () => {
  const res = await pluginsRoute.POST(
    jsonRequest("http://localhost/api/plugins", "POST", "not-json") as never
  );
  assert.equal(res.status, 400);
});

test("POST /api/plugins — well-formed but invalid body still returns 400", async () => {
  const res = await pluginsRoute.POST(
    jsonRequest("http://localhost/api/plugins", "POST", JSON.stringify({})) as never
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "Invalid request");
});
