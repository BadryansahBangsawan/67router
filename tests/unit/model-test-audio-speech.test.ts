// 67router removed /v1/audio/speech, so a model test must skip text-to-speech models
// (like the image/music/video generation models) instead of probing them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-speech-probe-"));
process.env.DATA_DIR = dataDir;
const { detectTestKind, runSingleModelTest } = await import("../../src/lib/api/modelTestRunner.ts");
const providers = await import("../../src/lib/db/providers.ts");
const core = await import("../../src/lib/db/core.ts");
test.after(() => {
  core.closeDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("speech models are classified as non-chat generation and never as chat", () => {
  for (const metadata of [
    { apiFormat: "audio-speech" },
    { supportedEndpoints: ["audio-speech"] },
  ]) {
    assert.equal(detectTestKind("el/eleven_turbo_v2_5", metadata).isNonChatGeneration, true);
  }
  assert.equal(detectTestKind("vendor/opaque", null, "audio-speech").isNonChatGeneration, true);
  assert.equal(
    detectTestKind("vendor/chat", { supportedEndpoints: ["chat", "audio-speech"] })
      .isNonChatGeneration,
    false
  );
});

test("speech model tests are skipped without any upstream request", async () => {
  await providers.createProviderNode({
    id: "openai-compatible-speech-probe",
    type: "openai-compatible",
    name: "Speech probe",
    prefix: "speechprobe",
    apiType: "audio-speech",
    baseUrl: "http://127.0.0.1:19876/v1",
  });
  const connection = await providers.createProviderConnection({
    provider: "openai-compatible-speech-probe",
    authType: "apikey",
    name: "Speech test",
    apiKey: "test-only-not-a-real-key",
    isActive: true,
    testStatus: "active",
  });
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;
  try {
    const result = await runSingleModelTest({
      providerId: "openai-compatible-speech-probe",
      modelId: "speechprobe/opaque-voice",
      connectionId: connection.id,
      timeoutMs: 5000,
    });
    assert.equal(result.status, "error", JSON.stringify(result));
    assert.equal(result.skipped, true);
    assert.equal(result.httpStatus, 422);
    assert.equal(requests.length, 0, "no upstream request for a speech model");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
