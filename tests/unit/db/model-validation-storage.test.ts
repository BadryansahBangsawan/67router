import "../../_setup/isolateDataDir.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createProviderConnection,
  updateProviderConnection,
} from "../../../src/lib/db/providers.ts";
import { getCustomModels } from "../../../src/lib/db/models.ts";
import { getDbInstance } from "../../../src/lib/db/core.ts";
import {
  createValidationSnapshot,
  commitValidatedModel,
} from "../../../src/lib/db/validatedModels.ts";

test("validated model commit fails closed if the selected connection changes", async () => {
  const connection = await createProviderConnection({
    provider: "openai",
    authType: "apikey",
    apiKey: "fake-validation-only",
    isActive: true,
  });
  const input = {
    provider: "openai",
    modelId: "unlisted-proof",
    connectionId: connection.id,
    allowInference: true as const,
    apiFormat: "chat-completions" as const,
  };
  const snapshot = createValidationSnapshot(input);
  await updateProviderConnection(connection.id, { isActive: false });
  assert.throws(
    () => commitValidatedModel(snapshot, input, { id: "fake-receipt" }),
    /changed|unavailable/
  );
  assert.equal((await getCustomModels("openai")).length, 0);
});

test("commit reads back metadata and refuses duplicate insertion or expired evidence", async () => {
  const connection = await createProviderConnection({
    provider: "openai",
    authType: "apikey",
    apiKey: "fake-validation-second",
    isActive: true,
  });
  const input = {
    provider: "openai",
    modelId: "saved-proof",
    connectionId: connection.id,
    modelName: "Saved proof",
    max_input_tokens: 32000,
    allowInference: true as const,
    apiFormat: "chat-completions" as const,
  };
  const snapshot = createValidationSnapshot(input);
  assert.throws(
    () => commitValidatedModel({ ...snapshot, startedAt: Date.now() - 90_001 }, input, {}),
    /changed|unavailable/
  );
  const saved = commitValidatedModel(snapshot, input, { id: "proof-receipt", status: "passed" });
  assert.equal(saved.inputTokenLimit, 32000);
  assert.equal(saved.name, "Saved proof");
  assert.equal(
    (await getCustomModels("openai")).find((model) => model.id === input.modelId)?.validation.id,
    "proof-receipt"
  );
  assert.throws(() => commitValidatedModel(snapshot, input, {}), /already exists/);
});

test("plugin configuration mutation invalidates transactional evidence", async () => {
  const connection = await createProviderConnection({
    provider: "openai",
    authType: "apikey",
    apiKey: "fake-plugin-config",
    isActive: true,
  });
  const input = {
    provider: "openai",
    modelId: "plugin-config-proof",
    connectionId: connection.id,
    allowInference: true as const,
    apiFormat: "chat-completions" as const,
  };
  const snapshot = createValidationSnapshot(input);
  // The plugin runtime is gone but its table stays and still feeds the fingerprint.
  getDbInstance()
    .prepare(
      `INSERT INTO plugins (id, name, manifest, plugin_dir, status)
       VALUES ('changed-plugin', 'changed-plugin', '{}', '/nonexistent-validation-fixture', 'inactive')`
    )
    .run();
  try {
    assert.throws(() => commitValidatedModel(snapshot, input, {}), /changed|unavailable/);
    assert.equal(
      (await getCustomModels("openai")).some((model) => model.id === input.modelId),
      false
    );
  } finally {
    getDbInstance().prepare("DELETE FROM plugins WHERE id = 'changed-plugin'").run();
  }
});
