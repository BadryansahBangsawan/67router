import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "omniroute-lmstudio-embedding-11233-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { parseEmbeddingModel } = await import("../../open-sse/config/embeddingRegistry.ts");
const core = await import("../../src/lib/db/core.ts");

test.after(() => {
  core.resetDbInstance();
  rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Issue #11233: the dashboard stores LM Studio connections under the provider
// id "lm-studio" (hyphenated), but the embedding registry keys the provider as
// "lmstudio" with no alias. Two symptoms resulted:
//   1. "lm-studio/<model>" embedding requests failed with 400 unknown provider.
//   2. "lmstudio/<model>" requests always hit the hardcoded localhost:1234
//      endpoint, ignoring the baseUrl of the configured connection.
// The fix mirrors the ollama-local pattern from #2824/#9225: an embedding
// provider alias plus optional (non-auth) connection hydration and the same
// baseUrl normalization in the handler.

test("lm-studio model strings resolve to the lmstudio embedding provider", () => {
  assert.deepEqual(parseEmbeddingModel("lm-studio/nomic-embed-text"), {
    provider: "lmstudio",
    model: "nomic-embed-text",
  });
});
