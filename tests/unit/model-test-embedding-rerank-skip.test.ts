// The /v1/embeddings and /v1/rerank endpoints were removed, so a model test for an embedding
// or rerank model has nothing to call. detectTestKind still classifies the model (so it is
// never sent as a chat completion) and runSingleModelTest skips it with 422, like non-chat
// generation models.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-embed-rerank-skip-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
process.env.DATA_DIR = TEST_DATA_DIR;

const { detectTestKind, runSingleModelTest } = await import("../../src/lib/api/modelTestRunner.ts");
const { resetDbInstance } = await import("../../src/lib/db/core.ts");

const serial = { concurrency: false };

test.after(() => {
  resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
});

async function runWithoutUpstream(providerId: string, modelId: string) {
  const originalFetch = globalThis.fetch;
  let dispatched = false;
  globalThis.fetch = async () => {
    dispatched = true;
    throw new Error("a skipped model test must not reach an upstream");
  };
  try {
    const result = await runSingleModelTest({ providerId, modelId, timeoutMs: 1_000 });
    return { result, dispatched };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("embedding models are still classified as embedding", serial, () => {
  const kind = detectTestKind(
    "openai/text-embedding-3-small",
    { supportedEndpoints: ["embeddings"] },
    undefined
  );
  assert.equal(kind.isEmbedding, true);
  assert.equal(kind.isNonChatGeneration, false);
});

test("an embedding model test is skipped with 422 and never dispatched", serial, async () => {
  const { result, dispatched } = await runWithoutUpstream("openai", "text-embedding-3-small");
  assert.equal(dispatched, false);
  assert.equal(result.status, "error");
  assert.equal(result.httpStatus, 422);
  assert.equal(result.skipped, true);
  assert.match(String(result.error), /embedding/i);
});

test("rerank models are still classified as rerank", serial, () => {
  const kind = detectTestKind("cohere/rerank-v3.5", { supportedEndpoints: ["rerank"] }, undefined);
  assert.equal(kind.isRerank, true);
  assert.equal(kind.isEmbedding, false);
});

test("a rerank model test is skipped with 422 and never dispatched", serial, async () => {
  const { result, dispatched } = await runWithoutUpstream("cohere", "rerank-v3.5");
  assert.equal(dispatched, false);
  assert.equal(result.status, "error");
  assert.equal(result.httpStatus, 422);
  assert.equal(result.skipped, true);
  assert.match(String(result.error), /rerank/i);
});
