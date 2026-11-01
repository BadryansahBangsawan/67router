import test from "node:test";
import assert from "node:assert/strict";

const { parseRerankModel, getAllRerankModels, getRerankProvider } =
  await import("../../open-sse/config/rerankRegistry.ts");

test("#5332 parseRerankModel resolves siliconflow multi-slash model id", () => {
  assert.deepEqual(parseRerankModel("siliconflow/Qwen/Qwen3-Reranker-8B"), {
    provider: "siliconflow",
    model: "Qwen/Qwen3-Reranker-8B",
  });
});

test("#5332 parseRerankModel resolves deepinfra multi-slash model id", () => {
  assert.deepEqual(parseRerankModel("deepinfra/Qwen/Qwen3-Reranker-0.6B"), {
    provider: "deepinfra",
    model: "Qwen/Qwen3-Reranker-0.6B",
  });
});

test("#5332 getAllRerankModels lists siliconflow + deepinfra reranker models", () => {
  const ids = getAllRerankModels().map((m) => m.id);
  assert.ok(ids.includes("siliconflow/Qwen/Qwen3-Reranker-8B"));
  assert.ok(ids.includes("deepinfra/Qwen/Qwen3-Reranker-8B"));
});

test("#5332 siliconflow and deepinfra registry entries stay listed", () => {
  assert.equal(getRerankProvider("siliconflow").baseUrl, "https://api.siliconflow.com/v1/rerank");
  assert.equal(getRerankProvider("deepinfra").format, "deepinfra");
});
