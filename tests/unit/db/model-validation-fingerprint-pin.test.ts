import "../../_setup/isolateDataDir.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { getDbInstance } from "../../../src/lib/db/core.ts";
import { createValidationSnapshot } from "../../../src/lib/db/validatedModels.ts";

// The plugin system was removed (67router PR-3) but the `plugins` table and its migrations
// stay. The validation fingerprint still hashes `SELECT * FROM plugins`, so an existing install
// keeps computing the exact same digest. This pins the digest for a fixed connection with an
// empty plugins table; a change to the hashed shape (dropping or renaming the `plugins` key,
// replacing the query with a different constant) breaks it.
const PINNED_EMPTY_PLUGINS_FINGERPRINT =
  "25040602612ea1e960702d860466d0d0d7a2baf0e382f6c6d7ccf4074555e413";

function seedFixedConnection() {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace IN ('settings', 'proxyConfig')").run();
  db.prepare(
    `INSERT INTO provider_connections (id, provider, auth_type, is_active, created_at, updated_at)
     VALUES ('pin-connection', 'openai', 'apikey', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).run();
}

const input = {
  provider: "openai",
  modelId: "pin-proof",
  connectionId: "pin-connection",
  allowInference: true as const,
  apiFormat: "chat-completions" as const,
};

test("validation fingerprint for an empty plugins table is pinned", () => {
  seedFixedConnection();
  assert.equal(getDbInstance().prepare("SELECT COUNT(*) AS n FROM plugins").get().n, 0);
  assert.equal(createValidationSnapshot(input).fingerprint, PINNED_EMPTY_PLUGINS_FINGERPRINT);
});

test("legacy plugins rows still feed the fingerprint", () => {
  const db = getDbInstance();
  db.prepare(
    `INSERT INTO plugins (id, name, manifest, plugin_dir, installed_at, updated_at)
     VALUES ('legacy', 'legacy', '{}', '/nonexistent', '2026-01-01', '2026-01-01')`
  ).run();
  try {
    assert.notEqual(createValidationSnapshot(input).fingerprint, PINNED_EMPTY_PLUGINS_FINGERPRINT);
  } finally {
    db.prepare("DELETE FROM plugins WHERE id = 'legacy'").run();
  }
  assert.equal(createValidationSnapshot(input).fingerprint, PINNED_EMPTY_PLUGINS_FINGERPRINT);
});
