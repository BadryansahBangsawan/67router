// PR-4 removed /v1/images/* and most audio endpoints. These media routes were kept on
// purpose (video, music, OCR, sound generation, audio transcription for the chat audio
// bridge, and the media cache read route). Each must still load and export its handlers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-media-kept-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "media-kept-routes-test-secret";

const core = await import("../../src/lib/db/core.ts");

const KEPT_ROUTES: Array<{ file: string; methods: string[] }> = [
  { file: "src/app/api/v1/videos/generations/route.ts", methods: ["POST", "GET", "OPTIONS"] },
  { file: "src/app/api/v1/music/generations/route.ts", methods: ["POST", "GET", "OPTIONS"] },
  { file: "src/app/api/v1/music/route.ts", methods: ["POST", "OPTIONS"] },
  { file: "src/app/api/v1/sound-generation/route.ts", methods: ["POST", "OPTIONS"] },
  { file: "src/app/api/v1/ocr/route.ts", methods: ["POST", "OPTIONS"] },
  { file: "src/app/api/v1/audio/transcriptions/route.ts", methods: ["POST", "OPTIONS"] },
  { file: "src/app/api/v1/media/[id]/route.ts", methods: ["GET", "OPTIONS"] },
];

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

for (const { file, methods } of KEPT_ROUTES) {
  test(`kept media route ${file} loads and exports ${methods.join("/")}`, async () => {
    const mod = (await import(`../../${file}`)) as Record<string, unknown>;
    for (const method of methods) {
      assert.equal(typeof mod[method], "function", `${file} must export ${method}`);
    }
  });
}

test("kept video handler still resolves after the image handler removal", async () => {
  const { handleVideoGeneration } = await import("../../open-sse/handlers/videoGeneration.ts");
  const { handleMusicGeneration } = await import("../../open-sse/handlers/musicGeneration.ts");
  assert.equal(typeof handleVideoGeneration, "function");
  assert.equal(typeof handleMusicGeneration, "function");
});

test("video and music OPTIONS preflight still answer", async () => {
  const video = await import("../../src/app/api/v1/videos/generations/route.ts");
  const music = await import("../../src/app/api/v1/music/generations/route.ts");
  for (const route of [video, music]) {
    const res = await (route.OPTIONS as () => Promise<Response> | Response)();
    assert.ok(res.status < 300, `preflight status ${res.status}`);
  }
});
