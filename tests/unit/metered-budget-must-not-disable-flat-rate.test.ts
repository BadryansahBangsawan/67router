/**
 * Metered-cost accounting: flat-rate traffic records no metered spend, metered
 * traffic records all of it. Also pins the combo classification of a
 * BUDGET_EXCEEDED 429 body (a local key-policy breach, never an upstream rate
 * limit), which stays in place for any producer of that code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-metered-budget-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "metered-budget-test-secret";

const costRules = await import("../../src/domain/costRules.ts");
const policy = await import("../../src/lib/usage/meteredBudgetPolicy.ts");
const comboPredicates = await import("../../open-sse/services/combo/comboPredicates.ts");

const METERED_PROVIDER = "openai";
const FLAT_RATE_PROVIDER = "opencode-go";
const KEY = "key-under-test";

function spend(usd: number) {
  costRules.recordCost(KEY, usd);
}

test.after(() => {
  costRules.resetCostData();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// ── B7 — flat-rate usage must not consume the metered allowance ────────────
test("B7: flat-rate usage records nothing against the allowance; metered usage records all of it", () => {
  assert.equal(policy.meteredBudgetCost(FLAT_RATE_PROVIDER, 4.2), 0);
  assert.equal(policy.meteredBudgetCost(METERED_PROVIDER, 4.2), 4.2);
  assert.equal(policy.consumesMeteredBudget(FLAT_RATE_PROVIDER), false);
  assert.equal(policy.consumesMeteredBudget(METERED_PROVIDER), true);

  // A bad pricing lookup can never credit the allowance back.
  assert.equal(policy.meteredBudgetCost(METERED_PROVIDER, -1), 0);
  assert.equal(policy.meteredBudgetCost(METERED_PROVIDER, Number.NaN), 0);
});

// ── B7 (end to end on the ledger) ─────────────────────────────────────────
test("B7: flat-rate traffic records no spend while metered traffic is recorded", () => {
  costRules.resetCostData();
  for (let i = 0; i < 20; i++) spend(policy.meteredBudgetCost(FLAT_RATE_PROVIDER, 3));
  assert.equal(costRules.getDailyTotal(KEY), 0);

  for (let i = 0; i < 20; i++) spend(policy.meteredBudgetCost(METERED_PROVIDER, 3));
  assert.equal(costRules.getDailyTotal(KEY), 60);
});

// ── Combo classification: a local budget refusal is not an upstream failure ─
test("a BUDGET_EXCEEDED 429 is classified as a local key-policy breach, never an upstream rate limit", () => {
  const budgetBody = { error: { code: "BUDGET_EXCEEDED", message: "Daily budget exceeded" } };
  const tokenBody = { error: { code: "TOKEN_LIMIT_EXCEEDED", message: "Token limit exceeded" } };
  const upstreamBody = { error: { code: "rate_limit_exceeded", message: "slow down" } };

  assert.equal(comboPredicates.isBudgetBreachErrorBody(budgetBody), true);
  assert.equal(comboPredicates.isLocalKeyPolicyBreachErrorBody(budgetBody), true);
  assert.equal(comboPredicates.isLocalKeyPolicyBreachErrorBody(tokenBody), true);
  assert.equal(comboPredicates.isLocalKeyPolicyBreachErrorBody(upstreamBody), false);

  // The pre-existing token-limit predicate keeps its exact meaning.
  assert.equal(comboPredicates.isTokenLimitBreachErrorBody(budgetBody), false);
  assert.equal(comboPredicates.isTokenLimitBreachErrorBody(tokenBody), true);
});

// ── The classification has to reach the combo exhaustion sets ──────────────
// A budget refusal carries HTTP 429 like an upstream rate limit does. If the
// combo loop classifies it as one, it adds the provider to
// transientRateLimitedProviders, which lets later targets in the SAME request
// reuse rate-limited connections for a provider nothing upstream refused.
test("a BUDGET_EXCEEDED 429 must not put the provider in the transient rate-limited set", async () => {
  const { applyComboTargetExhaustion } =
    await import("../../open-sse/services/combo/targetExhaustion.ts");
  const budgetBody = { error: { code: "BUDGET_EXCEEDED", message: "Daily budget exceeded" } };
  const upstreamBody = { error: { code: "rate_limit_exceeded", message: "slow down" } };
  const log = { info() {}, warn() {}, error() {}, debug() {} };
  const makeSets = () => ({
    exhaustedProviders: new Set<string>(),
    exhaustedConnections: new Set<string>(),
    transientRateLimitedProviders: new Set<string>(),
  });
  const target = {
    kind: "model",
    executionKey: "ek",
    modelStr: `${METERED_PROVIDER}/m1`,
    provider: METERED_PROVIDER,
    providerId: null,
    connectionId: "conn-budget",
  } as Parameters<typeof applyComboTargetExhaustion>[0];
  const base = {
    errorText: "Daily budget exceeded",
    rawModel: "m1",
    allAccountsRateLimited: false,
    requestScopedFailure: false,
    log,
    tag: "COMBO",
    exhaustedLogLevel: "info" as const,
    result: { status: 429 },
    fallbackResult: {},
  };

  const local = makeSets();
  applyComboTargetExhaustion(target, {
    ...base,
    isTokenLimitBreach: comboPredicates.isLocalKeyPolicyBreachErrorBody(budgetBody),
    sets: local,
  });
  assert.equal(local.transientRateLimitedProviders.size, 0);

  // Control: a real upstream 429 is still classified as one.
  const upstream = makeSets();
  applyComboTargetExhaustion(target, {
    ...base,
    isTokenLimitBreach: comboPredicates.isLocalKeyPolicyBreachErrorBody(upstreamBody),
    sets: upstream,
  });
  assert.ok(upstream.transientRateLimitedProviders.has(METERED_PROVIDER));
});
