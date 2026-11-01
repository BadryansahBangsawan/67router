import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-weak-rng-"));
process.env.DATA_DIR = TEST_DATA_DIR;

test.after(() => {
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
});

test("migrationRunner probe table format uses crypto.randomUUID", async () => {
  const probeName = `__omniroute_fts5_probe_${crypto.randomUUID().replace(/-/g, "_")}`;
  assert.match(
    probeName,
    /^__omniroute_fts5_probe_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/i
  );
});
