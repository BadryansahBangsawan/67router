/**
 * Unsafe-method MANAGEMENT requests must pass the browser-origin check whatever
 * the authenticated subject kind is. In open mode (requireLogin=false) the
 * subject is `anonymous`, and the origin / Sec-Fetch-Site check used to run only
 * for `dashboard_session`, so a cross-site page could drive management writes.
 *
 * Non-browser clients (CLI, curl, server-side fetch) send neither Origin nor
 * Sec-Fetch-Site and must keep working.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omr-authz-anon-origin-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "test-secret";
process.env.JWT_SECRET = "anon-origin-jwt-secret";

const core = await import("../../../src/lib/db/core.ts");
const settingsDb = await import("../../../src/lib/db/settings.ts");
const pipeline = await import("../../../src/server/authz/pipeline.ts");

const ORIGINAL_NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

test.before(async () => {
  await settingsDb.updateSettings({ requireLogin: false });
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_NEXT_PUBLIC_BASE_URL === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
  else process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL_NEXT_PUBLIC_BASE_URL;
});

const MANAGEMENT_URL = "http://localhost:20128/api/settings/proxy";

function mutation(headers: Record<string, string>, method = "POST"): NextRequest {
  return new NextRequest(MANAGEMENT_URL, {
    method,
    headers: { "content-type": "text/plain", ...headers },
    body: method === "GET" ? undefined : "{}",
  });
}

async function run(req: NextRequest) {
  return pipeline.runAuthzPipeline(req, { enforce: true });
}

test("anonymous mutation from a foreign Origin is rejected with INVALID_ORIGIN", async () => {
  const response = await run(mutation({ origin: "https://evil.example" }));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "INVALID_ORIGIN");
});

test("anonymous mutation flagged cross-site by Sec-Fetch-Site is rejected", async () => {
  const response = await run(mutation({ "sec-fetch-site": "cross-site" }));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "INVALID_ORIGIN");
});

test("anonymous mutation without Origin / Sec-Fetch-Site (CLI, curl) still passes", async () => {
  const response = await run(mutation({}));
  assert.notEqual(response.status, 403);
  assert.equal(response.headers.get("x-omniroute-route-class"), "MANAGEMENT");
});

test("anonymous same-origin browser mutation still passes", async () => {
  const response = await run(
    mutation({ origin: "http://localhost:20128", "sec-fetch-site": "same-origin" })
  );
  assert.notEqual(response.status, 403);
});

test("anonymous safe-method request from a foreign Origin is not origin-gated", async () => {
  const response = await run(mutation({ origin: "https://evil.example" }, "GET"));
  assert.notEqual(response.status, 403);
});
