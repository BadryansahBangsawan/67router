// tests/integration/combo-matrix/no-budget-gate.test.ts
//
// Domain budgets were removed from 67router. Recorded spend stays in the cost
// history, but it never gates routing: a combo keeps its normal priority order
// for a key with any amount of recorded spend, and the metered target is still
// the one dispatched.
import test from "node:test";
import assert from "node:assert/strict";
import { createComboRoutingHarness } from "../_comboRoutingHarness.ts";

const h = await createComboRoutingHarness("combo-no-budget-gate");
const {
  BaseExecutor,
  combosDb,
  handleChat,
  buildRequest,
  seedApiKey,
  seedConnection,
  resetStorage,
} = h;
const costRules = await import("../../../src/domain/costRules.ts");

function body(model: string) {
  return { model, stream: false, messages: [{ role: "user", content: `route ${model}` }] };
}

async function seedMixedCombo(name: string) {
  await seedConnection("openai", { apiKey: "sk-openai-no-budget" });
  await seedConnection("claude", { apiKey: "sk-claude-no-budget" });
  await combosDb.createCombo({
    name,
    strategy: "priority",
    config: { maxRetries: 0, retryDelayMs: 0 },
    models: ["openai/gpt-4o-mini", "claude/claude-sonnet-4-6"],
  });
}

test.beforeEach(async () => {
  BaseExecutor.RETRY_CONFIG.delayMs = 0;
  await resetStorage();
  costRules.resetCostData();
});
test.afterEach(async () => {
  BaseExecutor.RETRY_CONFIG.delayMs = h.originalRetryDelayMs;
  costRules.resetCostData();
  await resetStorage();
});
test.after(async () => {
  await h.cleanup();
});

test("a key with no recorded spend routes to the first combo target", async () => {
  await seedMixedCombo("nb-fresh");
  const key = await seedApiKey({ name: "fresh" });
  h.installRecordingFetch();

  const r = await handleChat(buildRequest({ body: body("nb-fresh"), authKey: key.key }));
  assert.equal(r.status, 200);
  assert.deepEqual(h.providersSeen(), ["openai"]);
});

test("heavy recorded spend does not change combo routing or reject the request", async () => {
  await seedMixedCombo("nb-spent");
  const key = await seedApiKey({ name: "spent" });
  costRules.recordCost(key.id, 10_000);
  h.installRecordingFetch();

  const r = await handleChat(buildRequest({ body: body("nb-spent"), authKey: key.key }));
  assert.equal(r.status, 200);
  assert.deepEqual(h.providersSeen(), ["openai"], "metered target must still win on priority");
});
