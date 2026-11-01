import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolated DATA_DIR before any module that may open the SQLite singleton.
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-media-cost-h-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "media-cost-h-test-api-key-secret";

const core = await import("../../src/lib/db/core.ts");
const { OMNIROUTE_RESPONSE_HEADERS } = await import("../../src/shared/constants/headers.ts");
const transcriptionRoute = await import("../../src/app/api/v1/audio/transcriptions/route.ts");
const videoRoute = await import("../../src/app/api/v1/videos/generations/route.ts");

const originalFetch = globalThis.fetch;

function restoreGlobals() {
  globalThis.fetch = originalFetch;
}

test.afterEach(() => {
  restoreGlobals();
});

test.after(() => {
  restoreGlobals();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("v1 video generation failure preserves provider status and error payload", async () => {
  globalThis.fetch = (async (url: unknown) => {
    assert.equal(String(url), "http://localhost:7860/animatediff/v1/generate");
    return new Response("provider busy", { status: 503 });
  }) as typeof fetch;

  const response = await videoRoute.POST(
    new Request("http://localhost/api/v1/videos/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sdwebui/animatediff-webui",
        prompt: "media failure test",
      }),
    })
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      message: "provider busy",
      type: "upstream_error",
      code: "upstream_error",
    },
  });
});

// Shared assertions: every successful media Response must carry the
// X-OmniRoute-* cost telemetry headers (parity with chat/embeddings).
// Cost may legitimately be 0 (free / unpriced modality) — formatOmniRouteCost
// still emits a fixed-10-decimal string ("0.0000000000"), so the format check
// holds regardless.
function assertCostTelemetryHeaders(response: Response) {
  assert.equal(response.status, 200);

  const cost = response.headers.get(OMNIROUTE_RESPONSE_HEADERS.responseCost);
  assert.ok(cost, "response cost header must be present");
  assert.match(
    cost as string,
    /^\d+\.\d{10}$/,
    `cost header must be a fixed-10-decimal number, got: ${cost}`
  );

  const version = response.headers.get(OMNIROUTE_RESPONSE_HEADERS.version);
  assert.ok(version && version.trim().length > 0, "version header must be non-empty");

  const provider = response.headers.get(OMNIROUTE_RESPONSE_HEADERS.provider);
  assert.ok(provider && provider.trim().length > 0, "provider header must be present");
}

test("v1 audio transcription success Response carries cost telemetry headers (cost 0)", async () => {
  globalThis.fetch = (async (url: unknown) => {
    const stringUrl = String(url);
    if (stringUrl === "http://localhost:8000/v1/audio/transcriptions") {
      return new Response(JSON.stringify({ text: "transcribed telemetry" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected URL: ${stringUrl}`);
  }) as typeof fetch;

  const formData = new FormData();
  formData.set("model", "qwen/qwen3-asr");
  formData.set("file", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), "clip.wav");

  const response = await transcriptionRoute.POST(
    new Request("http://localhost/api/v1/audio/transcriptions", {
      method: "POST",
      body: formData,
    })
  );

  assertCostTelemetryHeaders(response);
  assert.equal(
    response.headers.get(OMNIROUTE_RESPONSE_HEADERS.responseCost),
    "0.0000000000",
    "transcription duration unavailable → cost must be 0"
  );
});
