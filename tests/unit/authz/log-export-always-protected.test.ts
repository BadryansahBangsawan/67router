import test from "node:test";
import assert from "node:assert/strict";

import { isAlwaysProtectedPath } from "../../../src/server/authz/routeGuard.ts";
import { classifyRoute } from "../../../src/server/authz/classify.ts";

// Log-export destinations ship call_logs (prompts and responses, when
// includeBodies is set) to a caller-chosen sink, and the /run child starts the
// export. That is the same data class as /api/logs/export, which is already
// ALWAYS_PROTECTED, so the whole /api/log-export subtree must stay authenticated
// even under requireLogin=false.

const LOG_EXPORT_ROUTES = [
  "/api/log-export/destinations",
  "/api/log-export/destinations/dest-1",
  "/api/log-export/destinations/dest-1/test",
  "/api/log-export/destinations/dest-1/run",
  "/api/log-export/status",
  "/api/log-export/types",
];

test("every /api/log-export route is ALWAYS_PROTECTED", () => {
  for (const path of LOG_EXPORT_ROUTES) {
    assert.equal(isAlwaysProtectedPath(path), true, `${path} must be ALWAYS_PROTECTED`);
    assert.equal(classifyRoute(path, "POST").routeClass, "MANAGEMENT");
  }
});

test("/api/logs/export stays ALWAYS_PROTECTED (sibling of the same data class)", () => {
  assert.equal(isAlwaysProtectedPath("/api/logs/export"), true);
});
