// Quota Share (pools, groups, plans, the quota store) was removed from 67router.
// The generic quota modules used by routing, provider limits and connection
// recovery are kept; this pins that they still load and behave.
import test from "node:test";
import assert from "node:assert/strict";

const boundedMapMod = await import("../../src/lib/quota/boundedMap.ts");
const accountBuckets = await import("../../src/lib/quota/accountBuckets.ts");
const saturationSignals = await import("../../src/lib/quota/saturationSignals.ts");
const quotaScheduler = await import("../../src/lib/quota/quotaScheduler.ts");
const providerQuotaState = await import("../../src/lib/quota/providerQuotaState.ts");
const connectionRecovery = await import("../../src/lib/quota/connectionRecovery.ts");
const dimensions = await import("../../src/lib/quota/dimensions.ts");

test("generic quota modules still export their public API", () => {
  assert.equal(typeof boundedMapMod.boundedMap, "function");
  assert.equal(typeof accountBuckets.isBucketSaturated, "function");
  assert.equal(typeof accountBuckets.recordUsage, "function");
  assert.equal(typeof saturationSignals.storeRateLimitHeaders, "function");
  assert.equal(typeof saturationSignals.getTokenHeaderSaturation, "function");
  assert.equal(typeof quotaScheduler.canAffordRequest, "function");
  assert.equal(typeof quotaScheduler.reserveQuota, "function");
  assert.equal(typeof providerQuotaState.getProviderQuota, "function");
  assert.equal(typeof providerQuotaState.recordProviderQuotaUsage, "function");
  assert.equal(typeof connectionRecovery.isRecoverableCooldownConnection, "function");
  assert.ok(dimensions.QuotaDimensionSchema, "quota dimension schema is still exported");
});

test("quota dimension schema still validates a monthly token dimension", () => {
  const parsed = dimensions.QuotaUnitSchema.safeParse("tokens");
  assert.equal(parsed.success, true);
  assert.equal(dimensions.QuotaWindowSchema.safeParse("monthly").success, true);
});

test("the quota-weighted strategy is still a registered combo strategy", async () => {
  const { getStrategyTraits } = await import("../../open-sse/services/combo/strategyRegistry.ts");
  const traits = getStrategyTraits("quota-weighted");
  assert.equal(traits.ordering, "quota-weighted");
  assert.equal(traits.inflightReservation, "quota-weighted");
});

test("the removed quota-share strategy falls back to the default (declared) traits", async () => {
  const { getStrategyTraits, DEFAULT_STRATEGY_TRAITS } =
    await import("../../open-sse/services/combo/strategyRegistry.ts");
  assert.deepEqual({ ...getStrategyTraits("quota-share") }, { ...DEFAULT_STRATEGY_TRAITS });
});
