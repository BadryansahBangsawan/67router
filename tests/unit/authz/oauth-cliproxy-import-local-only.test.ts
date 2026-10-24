import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicApiRoute } from "../../../src/shared/constants/publicApiRoutes.ts";
import { classifyRoute } from "../../../src/server/authz/classify.ts";
import { isLocalOnlyPath } from "../../../src/server/authz/routeGuard.ts";
import { SPAWN_CAPABLE_PREFIXES } from "../../../src/shared/constants/spawnCapablePrefixes.ts";

// /api/oauth/cliproxy-import reads host-local CLIProxyAPI credential files
// (~/.cli-proxy-api) and imports them as connections — the same class as the
// cursor/kiro auto-import siblings. It must not ride the PUBLIC /api/oauth/
// prefix; it must classify MANAGEMENT, be loopback-gated, and never be
// whitelistable through the manage-scope bypass list.

const CLIPROXY_IMPORT = "/api/oauth/cliproxy-import";

test("cliproxy-import is excluded from PUBLIC classification", () => {
  for (const method of ["GET", "POST"]) {
    assert.equal(isPublicApiRoute(CLIPROXY_IMPORT, method), false);
    assert.equal(classifyRoute(CLIPROXY_IMPORT, method).routeClass, "MANAGEMENT");
  }
  assert.equal(isPublicApiRoute(`${CLIPROXY_IMPORT}/`, "GET"), false);
});

test("cliproxy-import is LOCAL_ONLY for every method", () => {
  assert.equal(isLocalOnlyPath(CLIPROXY_IMPORT), true);
  assert.equal(isLocalOnlyPath(CLIPROXY_IMPORT, "GET"), true);
  assert.equal(isLocalOnlyPath(CLIPROXY_IMPORT, "POST"), true);
});

test("cliproxy-import is never manage-scope bypassable", () => {
  assert.ok(SPAWN_CAPABLE_PREFIXES.includes(CLIPROXY_IMPORT));
});
