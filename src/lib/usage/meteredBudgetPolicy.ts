/**
 * Metered-cost policy — provider economics applied to recorded spend.
 *
 * Reads the ONE existing economic classification ({@link isFlatRateProvider})
 * and derives how much of a completed call is recorded as metered spend in the
 * per-key cost history:
 *
 * - {@link consumesMeteredBudget} — does a call to this provider count as
 *   metered spend at all?
 * - {@link meteredBudgetCost} — how much metered spend does a completed call
 *   record?
 * - {@link isUnpricedMeteredCost} — was a completed metered call's cost
 *   unknowable (no pricing row, no provider-reported cost)?
 *
 * Fail-closed by construction: the classification recognises flat-rate plans
 * explicitly, so an unknown or unclassified provider is metered. A metered
 * model never becomes free by having no price: its usage is recorded as
 * unpriced instead (see `recordUnpricedUsage` in domain/costRules).
 *
 * Cost OBSERVABILITY is deliberately untouched. Analytics compute their own
 * per-row cost from the request log with the `flatRateAsZero` option
 * (`lib/usage/costCalculator`, `lib/usage/usageStats`).
 *
 * @module lib/usage/meteredBudgetPolicy
 */

import { isFlatRateProvider } from "./flatRateProviders";
import type { CostCalculationResult } from "./costCalculator";

/**
 * Whether a call to this provider draws down the metered dollar allowance.
 *
 * Flat-rate plans are paid for by a subscription the allowance does not
 * govern; everything else — including an unknown provider — is metered.
 */
export function consumesMeteredBudget(providerId: string | null | undefined): boolean {
  return !isFlatRateProvider(providerId);
}

/**
 * The portion of an estimated request cost that the metered allowance should
 * absorb. Flat-rate providers contribute nothing: their per-token rows exist
 * for estimates and analytics, not for a bill the allowance is tracking.
 *
 * A negative or non-finite estimate is clamped to 0 so a bad pricing lookup
 * can never credit the allowance back.
 */
export function meteredBudgetCost(
  providerId: string | null | undefined,
  estimatedCost: number
): number {
  if (!consumesMeteredBudget(providerId)) return 0;
  if (!Number.isFinite(estimatedCost) || estimatedCost <= 0) return 0;
  return estimatedCost;
}

/**
 * Whether a completed call drew on the metered allowance at a cost nobody can
 * know: a metered provider, and no pricing row (or a failed lookup) behind the
 * $0 estimate. A $0 here is not free usage, so the caller records it as unpriced
 * instead of dropping it. Flat-rate plans never qualify, and a call with no
 * reported usage (`cost` null) priced nothing at all.
 */
export function isUnpricedMeteredCost(
  providerId: string | null | undefined,
  cost: CostCalculationResult | null | undefined
): boolean {
  return cost?.priced === false && consumesMeteredBudget(providerId);
}
