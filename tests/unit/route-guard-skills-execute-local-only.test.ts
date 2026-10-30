/**
 * Security regression (GHSA-jx89-f37j-pq89): /api/skills/install and
 * /api/skills/executions stay classified LOCAL_ONLY so loopback enforcement
 * runs unconditionally before any auth check.
 *
 * The Skills framework behind these routes (custom skill install + sandboxed
 * execute_command / eval_code built-ins) was removed in 67router. The prefixes
 * are kept on purpose: if an upstream merge reintroduces the routes, they must
 * never open remotely. Hard Rules #15 + #17. See docs/security/ROUTE_GUARD_TIERS.md.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocalOnlyBypassableByManageScope,
  isLocalOnlyPath,
} from "../../src/server/authz/routeGuard.ts";
import { SPAWN_CAPABLE_PREFIXES } from "../../src/shared/constants/spawnCapablePrefixes.ts";

test("GHSA-jx89: /api/skills/install is LOCAL_ONLY (registers a handler that can alias execute_command)", () => {
  assert.equal(isLocalOnlyPath("/api/skills/install"), true);
});

test("GHSA-jx89: /api/skills/install with trailing slash is LOCAL_ONLY", () => {
  assert.equal(isLocalOnlyPath("/api/skills/install/"), true);
});

test("GHSA-jx89: /api/skills/executions is LOCAL_ONLY (skillExecutor.execute reaches sandbox spawn)", () => {
  assert.equal(isLocalOnlyPath("/api/skills/executions"), true);
});

test("GHSA-jx89: /api/skills/executions with trailing slash is LOCAL_ONLY", () => {
  assert.equal(isLocalOnlyPath("/api/skills/executions/"), true);
});

test("GHSA-jx89: neither skills execution route can be opened through the manage-scope bypass", () => {
  for (const route of ["/api/skills/install", "/api/skills/executions"]) {
    assert.ok(
      SPAWN_CAPABLE_PREFIXES.includes(route),
      `${route} must be listed in SPAWN_CAPABLE_PREFIXES`
    );
    assert.equal(isLocalOnlyBypassableByManageScope(route), false);
  }
});

test("GHSA-jx89: the existing /api/skills/collect/ gate is untouched", () => {
  assert.equal(isLocalOnlyPath("/api/skills/collect/detect"), true);
});

test("GHSA-jx89: the rest of /api/skills/ stays remote-reachable (no over-broadening)", () => {
  // Registry listing / delete, marketplace and skillssh do not reach the sandbox
  // spawn: they stay on requireManagementAuth() and must remain tunnel-reachable.
  assert.equal(isLocalOnlyPath("/api/skills"), false);
  assert.equal(isLocalOnlyPath("/api/skills/"), false);
  assert.equal(isLocalOnlyPath("/api/skills/some-id"), false);
  assert.equal(isLocalOnlyPath("/api/skills/marketplace"), false);
  assert.equal(isLocalOnlyPath("/api/skills/marketplace/install"), false);
  assert.equal(isLocalOnlyPath("/api/skills/skillssh/install"), false);
});
