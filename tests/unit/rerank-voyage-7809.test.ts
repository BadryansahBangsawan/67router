import test from "node:test";
import assert from "node:assert/strict";

const { parseRerankModel, getRerankProvider } =
  await import("../../open-sse/config/rerankRegistry.ts");

// ─── Registry ──────────────────────────────────────────────────────────────

test("#7809 voyage-ai registry entry has format: 'voyage'", () => {
  const cfg = getRerankProvider("voyage-ai");
  assert.ok(cfg, "voyage-ai provider should exist");
  assert.equal(cfg.format, "voyage");
  assert.equal(cfg.baseUrl, "https://api.voyageai.com/v1/rerank");
});

test("#7809 parseRerankModel resolves voyage-ai/rerank-2.5", () => {
  assert.deepEqual(parseRerankModel("voyage-ai/rerank-2.5"), {
    provider: "voyage-ai",
    model: "rerank-2.5",
  });
});

test("#7809 parseRerankModel resolves voyage alias → voyage-ai", () => {
  assert.deepEqual(parseRerankModel("voyage/rerank-2.5-lite"), {
    provider: "voyage-ai",
    model: "rerank-2.5-lite",
  });
});
