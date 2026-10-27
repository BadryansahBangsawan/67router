import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The pending continuation bridge holds a full conversation per entry. An entry
// whose durable write never lands and whose id is never looked up again must
// not stay in memory forever.

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-continuation-bounded-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const store = await import("../../src/lib/db/responsesContinuationStore.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const pipeline = {
  clientRawRequest: { effectiveInput: [{ role: "user", content: "hi" }] },
  clientResponse: { output: [{ type: "message", content: "hello" }] },
};

test("expired pending entries are swept on the next seed without being looked up", (t) => {
  store.clearAllPendingContinuationStates();
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);

  store.seedPendingContinuationState("resp-old", "key", pipeline, false);
  now += 61_000;
  store.seedPendingContinuationState("resp-new", "key", pipeline, false);

  assert.equal(store.getPendingContinuationCount(), 1, "the expired entry must be dropped");
});

test("pending entries are capped even when nothing has expired yet", () => {
  store.clearAllPendingContinuationStates();
  for (let i = 0; i < 5000; i++) {
    store.seedPendingContinuationState(`resp-${i}`, "key", pipeline, false);
  }
  assert.ok(
    store.getPendingContinuationCount() <= 1000,
    `bridge must stay bounded (got ${store.getPendingContinuationCount()})`
  );
  // Newest entries survive: they are the ones a client is about to continue from.
  assert.ok(store.resolvePreviousResponseState("resp-4999", "key"));
});
