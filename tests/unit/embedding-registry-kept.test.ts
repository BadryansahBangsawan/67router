import test from "node:test";
import assert from "node:assert/strict";

// The /v1/embeddings endpoint was removed, but embeddingRegistry stays: /v1/models, provider
// validation, model discovery and the semantic-cache embedding options read it. These tests
// were kept from the removed endpoint suites because they only exercise the registry.
const registry = await import("../../open-sse/config/embeddingRegistry.ts");
const {
  getEmbeddingProvider,
  parseEmbeddingModel,
  getEmbeddingDimension,
  detectEmbeddingDimensionConflict,
} = registry;
const { LOCAL_PROVIDERS } = await import("../../src/shared/constants/providers/local.ts");

test("getEmbeddingDimension returns undefined for unknown/local models", () => {
  assert.equal(getEmbeddingDimension("localembed/my-model"), undefined);
  assert.equal(getEmbeddingDimension("mystery/whatever"), undefined);
});

test("detectEmbeddingDimensionConflict flags mixed vector spaces", () => {
  const res = detectEmbeddingDimensionConflict([
    "openai/text-embedding-3-small", // 1536
    "nebius/Qwen/Qwen3-Embedding-8B", // 4096
  ]);
  assert.equal(res.conflict, true);
  assert.deepEqual(res.distinct, [1536, 4096]);
});

test("detectEmbeddingDimensionConflict ignores unknown dimensions (no false positive)", () => {
  const res = detectEmbeddingDimensionConflict([
    "openai/text-embedding-3-small", // 1536 (known)
    "localembed/unknown", // undefined (ignored)
  ]);
  assert.equal(res.conflict, false);
  assert.deepEqual(res.distinct, [1536]);
});

test("detectEmbeddingDimensionConflict is a no-op for empty / all-unknown lists", () => {
  assert.equal(detectEmbeddingDimensionConflict([]).conflict, false);
  assert.equal(detectEmbeddingDimensionConflict(["localembed/a", "localembed/b"]).conflict, false);
});

test("lemonade embedding registry exposes the local endpoint and curated harrier model", () => {
  const provider = getEmbeddingProvider("lemonade");
  assert.ok(provider);
  assert.equal(provider.baseUrl, "http://localhost:13305/v1/embeddings");
  assert.equal(provider.authType, "none");
  assert.equal(provider.authHeader, "bearer");
  assert.deepEqual(provider.models, [
    { id: "harrier-oss-v1-0.6b", name: "Harrier OSS v1 0.6B", dimensions: 1024 },
  ]);
  assert.equal(getEmbeddingDimension("lemonade/harrier-oss-v1-0.6b"), 1024);
  assert.equal(getEmbeddingDimension("harrier-oss-v1-0.6b"), 1024);
});

test("llama-cpp embedding registry exposes the local llama-server endpoint", () => {
  const provider = getEmbeddingProvider("llama-cpp");
  assert.ok(provider);
  assert.equal(provider.baseUrl, "http://127.0.0.1:8080/v1/embeddings");
  assert.equal(provider.authType, "none");
  assert.equal(provider.authHeader, "bearer");
  assert.deepEqual(provider.models, []);
});

test("parseEmbeddingModel resolves lemonade, llama-cpp, and aliases", () => {
  assert.deepEqual(parseEmbeddingModel("lemonade/harrier-oss-v1-0.6b"), {
    provider: "lemonade",
    model: "harrier-oss-v1-0.6b",
  });

  // Bare curated model resolves automatically to lemonade
  assert.deepEqual(parseEmbeddingModel("harrier-oss-v1-0.6b"), {
    provider: "lemonade",
    model: "harrier-oss-v1-0.6b",
  });

  // llama.cpp and aliases
  assert.deepEqual(parseEmbeddingModel("llama-cpp/custom-embed"), {
    provider: "llama-cpp",
    model: "custom-embed",
  });
  assert.deepEqual(parseEmbeddingModel("llamacpp/custom-embed"), {
    provider: "llama-cpp",
    model: "custom-embed",
  });
  assert.deepEqual(parseEmbeddingModel("llama.cpp/custom-embed"), {
    provider: "llama-cpp",
    model: "custom-embed",
  });
});

test("LOCAL_PROVIDERS declares embedding serviceKind for lemonade and llama-cpp", () => {
  assert.ok(LOCAL_PROVIDERS.lemonade.serviceKinds.includes("embedding"));
  assert.ok(LOCAL_PROVIDERS["llama-cpp"].serviceKinds.includes("embedding"));
});

test("ollama-local exposes a static no-auth embedding registry entry", () => {
  const provider = getEmbeddingProvider("ollama-local");

  assert.ok(provider);
  assert.equal(provider.baseUrl, "http://localhost:11434/v1/embeddings");
  assert.equal(provider.authType, "none");
  assert.equal(provider.authHeader, "none");
  assert.deepEqual(
    provider.models.map((model) => model.id),
    ["embeddinggemma", "nomic-embed-text", "bge-m3"]
  );
});

test("ollama-local model names parse with the provider prefix", () => {
  assert.deepEqual(parseEmbeddingModel("ollama-local/nomic-embed-text"), {
    provider: "ollama-local",
    model: "nomic-embed-text",
  });
});

test("clova embedding v2 is registered with the single-text protocol", () => {
  const provider = registry.getEmbeddingProvider("clova-studio");
  assert.ok(provider, "clova-studio must be an embedding provider");
  assert.equal(provider.baseUrl, "https://clovastudio.stream.ntruss.com/v1/api-tools/embedding/v2");
  assert.equal(provider.singleTextProtocol, "clova-v2");
  assert.equal(provider.authType, "apikey");
  assert.equal(provider.authHeader, "bearer");
  assert.deepEqual(provider.models, [
    { id: "clova-embedding-v2", name: "CLOVA Embedding v2", dimensions: 1024 },
  ]);
});

test("clova embedding v2 resolves its model and dimension", () => {
  assert.deepEqual(registry.parseEmbeddingModel("clova-studio/clova-embedding-v2"), {
    provider: "clova-studio",
    model: "clova-embedding-v2",
  });
  assert.equal(registry.getEmbeddingDimension("clova-studio/clova-embedding-v2"), 1024);
});

test("catalog id is gemini/gemini-embedding-2; google/ is an alias", () => {
  const native = parseEmbeddingModel("gemini/gemini-embedding-2");
  assert.equal(native.provider, "gemini");
  assert.equal(native.model, "gemini-embedding-2");
  assert.equal(getEmbeddingDimension("gemini/gemini-embedding-2"), 3072);

  const aliased = parseEmbeddingModel("google/gemini-embedding-2");
  assert.equal(aliased.provider, "gemini");
  assert.equal(aliased.model, "gemini-embedding-2");

  const preview = parseEmbeddingModel("google/gemini-embedding-2-preview");
  assert.equal(preview.provider, "gemini");
  assert.equal(preview.model, "gemini-embedding-2-preview");

  // Custom provider_node prefix `google` plus embedding-001 must stay unaliased.
  const custom = parseEmbeddingModel("google/gemini-embedding-001");
  assert.equal(custom.provider, "google");
  assert.equal(custom.model, "gemini-embedding-001");
});
