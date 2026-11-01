/**
 * Cost Rules — Domain Layer (T-19)
 *
 * Business rules for cost management: recorded spend, reset-window math
 * (shared with per-key token limits) and cost summaries per API key.
 *
 * State is persisted in SQLite via domainState.ts.
 *
 * @module domain/costRules
 */

import { deleteAllCostData, loadCostEntries } from "../lib/db/domainState";
import { resetSpendBatchWriterForTests, spendBatchWriter } from "@/lib/spend/batchWriter";
import { recordLedgerFromCost } from "@/lib/usage/costLedgerRecorder";
import { recordUnpricedKeyQuotaUsage } from "@/domain/keyQuota";
import { isFlatRateProvider } from "@/lib/usage/flatRateProviders";

export type BudgetResetInterval = "daily" | "weekly" | "monthly";

interface CostEntry {
  cost: number;
  timestamp: number;
}

interface BudgetWindow {
  periodStartAt: number;
  nextResetAt: number;
}

interface CostSummary {
  dailyTotal: number;
  monthlyTotal: number;
  totalEntries: number;
  totalCostToday: number;
  totalCostMonth: number;
}

const RESET_TIME_REGEX = /^(\d{2}):(\d{2})$/;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toCostEntries(value: unknown): CostEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CostEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const cost = toNumber(record.cost, Number.NaN);
    const timestamp = toNumber(record.timestamp, Number.NaN);
    if (!Number.isFinite(cost) || !Number.isFinite(timestamp)) continue;
    entries.push({ cost, timestamp });
  }
  return entries;
}

function sumEntries(entries: CostEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.cost, 0);
}

function normalizeResetTime(value: unknown): string {
  if (typeof value === "string") {
    const match = value.trim().match(RESET_TIME_REGEX);
    if (match) {
      const hours = Math.min(Math.max(parseInt(match[1], 10), 0), 23);
      const minutes = Math.min(Math.max(parseInt(match[2], 10), 0), 59);
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return "00:00";
}

function getResetTimeParts(resetTime: string): [number, number] {
  const match = resetTime.match(RESET_TIME_REGEX);
  if (!match) return [0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10)];
}

function getUtcDateMs(year: number, month: number, day: number, hours: number, minutes: number) {
  return Date.UTC(year, month, day, hours, minutes, 0, 0);
}

export function getBudgetWindow(
  resetInterval: BudgetResetInterval,
  resetTime = "00:00",
  now = Date.now()
): BudgetWindow {
  const current = new Date(now);
  const [hours, minutes] = getResetTimeParts(normalizeResetTime(resetTime));
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const day = current.getUTCDate();

  if (resetInterval === "weekly") {
    const daysSinceMonday = (current.getUTCDay() + 6) % 7;
    const thisWeekReset = getUtcDateMs(year, month, day - daysSinceMonday, hours, minutes);
    return now >= thisWeekReset
      ? {
          periodStartAt: thisWeekReset,
          nextResetAt: getUtcDateMs(year, month, day - daysSinceMonday + 7, hours, minutes),
        }
      : {
          periodStartAt: getUtcDateMs(year, month, day - daysSinceMonday - 7, hours, minutes),
          nextResetAt: thisWeekReset,
        };
  }

  if (resetInterval === "monthly") {
    const thisMonthReset = getUtcDateMs(year, month, 1, hours, minutes);
    return now >= thisMonthReset
      ? {
          periodStartAt: thisMonthReset,
          nextResetAt: getUtcDateMs(year, month + 1, 1, hours, minutes),
        }
      : {
          periodStartAt: getUtcDateMs(year, month - 1, 1, hours, minutes),
          nextResetAt: thisMonthReset,
        };
  }

  const todayReset = getUtcDateMs(year, month, day, hours, minutes);
  return now >= todayReset
    ? {
        periodStartAt: todayReset,
        nextResetAt: getUtcDateMs(year, month, day + 1, hours, minutes),
      }
    : {
        periodStartAt: getUtcDateMs(year, month, day - 1, hours, minutes),
        nextResetAt: todayReset,
      };
}

/**
 * Record a cost for an API key.
 *
 * When `details` is provided, the same call is appended to the per-request cost
 * ledger (`request_cost_ledger`) with the full breakdown so the amount is
 * traceable to provider/model/tokens — used by the chat paths. Bare calls
 * (web-search cost, etc.) write an amount-only ledger row with unknown
 * provider/model.
 *
 * @param {string} apiKeyId
 * @param {number} cost - Cost in USD
 * @param {RecordCostDetails} [details] - Optional per-request breakdown.
 */
export function recordCost(apiKeyId: string, cost: number, details?: RecordCostDetails): void {
  try {
    spendBatchWriter.increment(apiKeyId, cost, Date.now());
    if (details) {
      // Fire-and-forget — never block the response on ledger I/O.
      void recordLedgerFromCost({
        apiKeyId,
        provider: details.provider,
        model: details.model,
        tokens: details.tokens,
        amountUsd: cost,
        serviceTier: details.serviceTier,
        success: details.success,
        timestamp: details.timestamp,
        requestId: details.requestId,
      });
    }
  } catch {
    // Non-critical.
  }
}

/**
 * Optional per-request breakdown passed to {@link recordCost} for ledger
 * traceability. `tokens` is the raw provider/normalized usage object — the
 * same shape `saveRequestUsage` accepts.
 */
export interface RecordCostDetails {
  provider?: string | null;
  model?: string | null;
  tokens?: unknown;
  serviceTier?: string | null;
  success?: boolean;
  timestamp?: string;
  requestId?: string | null;
}

/**
 * Build the provider/model/tokens/serviceTier/requestId breakdown shared by
 * both {@link recordChatCallCost} call sites in chatCore.ts (built once,
 * kept out of that file to stay under its frozen file-size ratchet).
 */
export function buildCostCtx(
  provider: string | null | undefined,
  model: string | null | undefined,
  tokens: unknown,
  serviceTier: string | null | undefined,
  requestId: string | null | undefined
): RecordCostDetails {
  return { provider, model, tokens, serviceTier, requestId };
}

/**
 * Record a chat-path cost when there is a real amount to log — the shared
 * `apiKeyInfo?.id && estimatedCost > 0` guard used at both chatCore.ts
 * `recordCost` call sites. `context` (see {@link buildCostCtx}) is
 * built once by the caller; only `success` varies per call site. `unpriced`
 * marks a metered call whose $0 has no price behind it, which is recorded
 * instead of being dropped (see {@link recordUnpricedBudgetUsage}).
 */
export function recordChatCallCost(
  apiKeyInfo: { id?: string | null } | null | undefined,
  estimatedCost: number,
  context: RecordCostDetails,
  success: boolean,
  unpriced = false
): void {
  if (!apiKeyInfo?.id) return;
  if (unpriced) recordUnpricedBudgetUsage(apiKeyInfo.id, context);
  if (estimatedCost <= 0) return;
  recordCost(apiKeyInfo.id, estimatedCost, { ...context, success });
}

/**
 * Record a priced non-chat call (image, speech, video/music, rerank) in the
 * key's cost history and cost ledger. These routes already price each
 * successful call for the X-OmniRoute cost header; only the metered share is
 * recorded, as on the chat path. Never throws.
 */
export function recordModalCallCost(
  apiKeyId: string | null | undefined,
  call: { provider: string; model?: string | null; costUsd: number }
): void {
  if (!apiKeyId) return;
  // Same rule as meteredBudgetCost(): flat-rate plans are not metered spend.
  if (isFlatRateProvider(call.provider)) return;
  if (!Number.isFinite(call.costUsd) || call.costUsd <= 0) return;
  recordCost(apiKeyId, call.costUsd, { provider: call.provider, model: call.model, success: true });
}

/**
 * Record that a completed call used a metered model whose cost could not be
 * priced (no pricing row and no provider-reported cost). That $0 is not free
 * usage: the monthly USD key quota sums the same priced ledger, so it fails
 * closed for the rest of its period (see `recordUnpricedKeyQuotaUsage`).
 */
export function recordUnpricedBudgetUsage(
  apiKeyId: string,
  details: Pick<RecordCostDetails, "provider" | "model"> = {}
): void {
  recordUnpricedKeyQuotaUsage(apiKeyId, details);
}

/**
 * Get daily total cost for an API key.
 *
 * @param {string} apiKeyId
 * @returns {number} Total cost today in USD
 */
export function getDailyTotal(apiKeyId: string): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    return (
      sumEntries(toCostEntries(loadCostEntries(apiKeyId, todayStart.getTime()))) +
      spendBatchWriter.getPendingCostTotal(apiKeyId, todayStart.getTime())
    );
  } catch {
    return 0;
  }
}

/**
 * Get cost summary for an API key.
 *
 * @param {string} apiKeyId
 * @returns {CostSummary}
 */
export function getCostSummary(apiKeyId: string): CostSummary {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const dailyEntries = [
      ...toCostEntries(loadCostEntries(apiKeyId, todayStart.getTime())),
      ...spendBatchWriter.getBufferedEntries(apiKeyId, todayStart.getTime()),
    ];
    const monthlyEntries = [
      ...toCostEntries(loadCostEntries(apiKeyId, monthStart.getTime())),
      ...spendBatchWriter.getBufferedEntries(apiKeyId, monthStart.getTime()),
    ];
    const dailyTotal = sumEntries(dailyEntries);
    const monthlyTotal = sumEntries(monthlyEntries);

    return {
      dailyTotal,
      monthlyTotal,
      totalEntries: monthlyEntries.length,
      totalCostToday: dailyTotal,
      totalCostMonth: monthlyTotal,
    };
  } catch {
    return {
      dailyTotal: 0,
      monthlyTotal: 0,
      totalEntries: 0,
      totalCostToday: 0,
      totalCostMonth: 0,
    };
  }
}

/**
 * Clear all cost data (for testing).
 */
export function resetCostData() {
  resetSpendBatchWriterForTests();
  try {
    deleteAllCostData();
  } catch {
    // Non-critical.
  }
}
