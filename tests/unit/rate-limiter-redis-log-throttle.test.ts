import "../../open-sse/utils/setupPolyfill.ts";
import test from "node:test";
import assert from "node:assert/strict";

// Moved from the removed free-proxy sync suite (#4878): the Redis error-log throttle is kept.
const rateLimiter = await import("../../src/shared/utils/rateLimiter.ts");

test("#4878 shouldLogRedisError only logs once per error-state change", () => {
  const tracker = rateLimiter._createRedisLogThrottleForTests();

  // First error in a run → log.
  assert.equal(tracker.shouldLog("ECONNREFUSED"), true);
  // Same error repeated (retry flood) → suppressed.
  assert.equal(tracker.shouldLog("ECONNREFUSED"), false);
  assert.equal(tracker.shouldLog("ECONNREFUSED"), false);
  // A different error message → state changed → log once more.
  assert.equal(tracker.shouldLog("ETIMEDOUT"), true);
  assert.equal(tracker.shouldLog("ETIMEDOUT"), false);
});
