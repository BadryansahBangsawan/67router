/**
 * Round-robin combos used to parse upstream error bodies with a private copy of
 * executeTargetAttempt's extraction block that only read the top-level
 * `retryAfter`. The nested `error.retry_after` / `error.reset_at` /
 * `error.reset_seconds` hints (live incident 1784457764961-73) and the
 * Retry-After header were dropped, so an all-exhausted round-robin pool answered
 * without a Retry-After. Both paths now share extractComboErrorInfo().
 *
 * Harness mirrors tests/unit/combo-strategy-fallbacks.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-rr-nested-retry-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { handleComboChat } = await import("../../open-sse/services/combo.ts");
const { rrStickyTargets } = await import("../../open-sse/services/combo/rrState.ts");
const core = await import("../../src/lib/db/core.ts");
const { resetAllComboMetrics } = await import("../../open-sse/services/comboMetrics.ts");
const { resetAllCircuitBreakers } = await import("../../src/shared/utils/circuitBreaker.ts");
const { clearAllModelLockouts } = await import("../../open-sse/services/accountFallback.ts");
const { resetAll: resetAllSemaphores } =
  await import("../../open-sse/services/rateLimitSemaphore.ts");

function createLog() {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop, debug: noop };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test.beforeEach(() => {
  resetAllComboMetrics();
  resetAllCircuitBreakers();
  resetAllSemaphores();
  clearAllModelLockouts();
  rrStickyTargets.clear();
});

test.after(() => {
  resetAllCircuitBreakers();
  clearAllModelLockouts();
  try {
    core.resetDbInstance();
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
});

test("round-robin honours a nested error.retry_after (seconds) in the terminal Retry-After", async () => {
  const combo = {
    name: "rr-nested-retry-after",
    strategy: "round-robin",
    models: ["openai/a", "claude/b"],
    config: { maxRetries: 0, retryDelayMs: 0, fallbackDelayMs: 0 },
  };

  const res = await handleComboChat({
    body: {},
    combo,
    handleSingleModel: async () =>
      jsonResponse(503, { error: { message: "upstream overloaded", retry_after: 90 } }),
    isModelAvailable: async () => true,
    log: createLog(),
    settings: null,
    allCombos: null,
  });

  assert.equal(res.ok, false);
  const retryAfter = Number(res.headers.get("Retry-After"));
  assert.ok(
    retryAfter >= 85 && retryAfter <= 90,
    `expected Retry-After ~90s from the nested hint, got ${res.headers.get("Retry-After")}`
  );
});

test("extractComboErrorInfo: nested reset_at / retry_after / reset_seconds / header precedence", async () => {
  const { extractComboErrorInfo } = await import("../../open-sse/services/combo/errorInfo.ts");
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const a = await extractComboErrorInfo(
    jsonResponse(429, { error: { message: "m", reset_at: resetAt, retry_after: 5 } })
  );
  assert.equal(a.retryAfter, resetAt);
  assert.equal(a.errorText, "m");

  const b = await extractComboErrorInfo(jsonResponse(429, { error: { reset_seconds: 30 } }));
  const bMs = new Date(String(b.retryAfter)).getTime() - Date.now();
  assert.ok(bMs > 25_000 && bMs <= 30_000, `reset_seconds coerced, got ${bMs}ms`);

  const c = await extractComboErrorInfo(
    jsonResponse(429, { error: { message: "x" } }, { "retry-after": "45" })
  );
  const cMs = new Date(String(c.retryAfter)).getTime() - Date.now();
  assert.ok(cMs > 40_000 && cMs <= 45_000, `Retry-After header honoured, got ${cMs}ms`);

  const top = await extractComboErrorInfo(
    jsonResponse(429, { retryAfter: "2030-01-01T00:00:00.000Z", error: { retry_after: 5 } })
  );
  assert.equal(top.retryAfter, "2030-01-01T00:00:00.000Z");

  const unparsable = await extractComboErrorInfo(
    new Response("not json at all", { status: 500, statusText: "Internal" })
  );
  assert.equal(unparsable.errorText, "not json at all");
  assert.equal(unparsable.errorBody, null);
});
