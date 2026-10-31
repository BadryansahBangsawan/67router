/**
 * 67router removed /v1/images/* and /v1/audio/speech, so `/v1/models` must not advertise
 * registry image or text-to-speech models: a client picking `openai/gpt-image-1` or
 * `openai/tts-1` from the catalog would only get a 404. Transcription models stay listed
 * because /v1/audio/transcriptions is kept (the chat audio bridge uses it).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-no-image-speech-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const v1ModelsCatalog = await import("../../src/app/api/v1/models/catalog.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("/v1/models lists no image models and no speech models, but keeps transcription", async () => {
  // openai carries image, speech and transcription models in the registries.
  await providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "openai-main",
    apiKey: "sk-test",
    isActive: true,
  });

  const res = await v1ModelsCatalog.getUnifiedModelsResponse(
    new Request("http://localhost/api/v1/models", { method: "GET" })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: Array<{ id: string; type?: string; subtype?: string }>;
  };

  assert.ok(body.data.length > 0, "catalog should not be empty");
  const images = body.data.filter((m) => m.type === "image").map((m) => m.id);
  assert.deepEqual(images, [], `image models still listed: ${images.join(", ")}`);
  const speech = body.data
    .filter((m) => m.type === "audio" && m.subtype === "speech")
    .map((m) => m.id);
  assert.deepEqual(speech, [], `speech models still listed: ${speech.join(", ")}`);
  const transcription = body.data.filter(
    (m) => m.type === "audio" && m.subtype === "transcription"
  );
  assert.ok(transcription.length > 0, "transcription models must stay listed");
});
