/**
 * Regression test for #14481 — "/v1/files and /v1/batches authz residuals
 * after #13881/#13882" — item 1 (policy enforcement) is closed by #14495 and
 * covered by tests/unit/files-batches-api-key-policy.test.ts. This file
 * covers the residuals this issue confirmed still open:
 *
 *   (A) item 2/LEDGER-5 — a `manage`/`admin`-scope key (the deployment-time
 *       env key, or any user key explicitly granted that scope) was demoted
 *       to an ordinary single-tenant key on /v1/files and /v1/batches:
 *       resolveListScope()/canAccessOwnedRecord() never consulted
 *       hasManageScope(). Fixed by branching on
 *       hasManageScope(scope.apiKeyMetadata?.scopes ?? []) in both, same as
 *       the isSessionAuth branch.
 *
 *   (B) item 4/LEDGER-19 — canAccessOwnedRecord() returned true the moment
 *       isSessionAuth was true, BEFORE checking the apiKeyId override the
 *       caller passed in — so a request carrying both a dashboard session
 *       cookie and a foreign tenant's API key was authorized against that
 *       tenant's file, even though the resulting batch/record is attributed
 *       to the KEY, not the session. Fixed by checking the apiKeyId override
 *       first; a pure session caller (no override) is still unrestricted.
 *
 * Also guards the ordinary single-actor paths (session-only, key-only)
 * against regressing #13882/GHSA-2jm2 coverage, per the plan-file's ask.
 *
 * (A) and (B) are pure-function checks. The /v1/files and /v1/batches routes
 * (and the (C) cursor residual) were removed from 67router; the helpers stay
 * in use by other owner-scoped routes. Self-isolating: DATA_DIR points at a
 * fresh temp dir BEFORE any @/lib/db/* module loads.
 */
import { describe, it, after as afterAll } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "apikey-scope-manage-14481-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { resolveListScope, canAccessOwnedRecord } =
  await import("../../src/app/api/v1/_helpers/apiKeyScope.ts");
type ApiKeyRequestScope = Awaited<
  ReturnType<typeof import("../../src/app/api/v1/_helpers/apiKeyScope.ts").getApiKeyRequestScope>
>;
const { resetDbInstance } = await import("../../src/lib/db/core.ts");

afterAll(() => {
  resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function manageScopeKeyScope(): ApiKeyRequestScope {
  return {
    apiKey: "env-configured-key-value",
    apiKeyId: "env-key",
    apiKeyMetadata: { scopes: ["manage"] } as ApiKeyRequestScope["apiKeyMetadata"],
    keyState: "valid",
    rejection: null,
    isSessionAuth: false,
  };
}

describe("#14481 (A) manage-scope key gets instance-wide access on /v1/files and /v1/batches", () => {
  it("resolveListScope() grants instance-wide visibility to a manage-scope key", () => {
    const result = resolveListScope(manageScopeKeyScope());
    assert.strictEqual(result.mode, "instance");
  });

  it("canAccessOwnedRecord() allows a manage-scope key to access another tenant's record", () => {
    const scope = manageScopeKeyScope();
    assert.strictEqual(canAccessOwnedRecord(scope, "some-other-tenant-api-key-id"), true);
  });

  it("an ordinary (non-manage) key is still denied instance-wide visibility (no over-widening)", () => {
    const scope: ApiKeyRequestScope = {
      apiKey: "ordinary-key-value",
      apiKeyId: "ordinary-key-id",
      apiKeyMetadata: { scopes: [] } as unknown as ApiKeyRequestScope["apiKeyMetadata"],
      keyState: "valid",
      rejection: null,
      isSessionAuth: false,
    };
    const result = resolveListScope(scope);
    assert.deepStrictEqual(result, { mode: "api_key", apiKeyId: "ordinary-key-id" });
    assert.strictEqual(canAccessOwnedRecord(scope, "some-other-tenant-api-key-id"), false);
  });
});

describe("#14481 (B) session+key precedence — the apiKeyId override is checked before isSessionAuth", () => {
  it("DENIES a session+foreign-key request access to a file it does not own", () => {
    const scope: ApiKeyRequestScope = {
      apiKey: "tenant-a-key-value",
      apiKeyId: "tenant-a-key-id",
      apiKeyMetadata: { scopes: [] } as unknown as ApiKeyRequestScope["apiKeyMetadata"],
      keyState: "valid",
      rejection: null,
      isSessionAuth: true,
    };
    assert.strictEqual(canAccessOwnedRecord(scope, "tenant-b-key-id"), false);
  });

  it("still ALLOWS a session+key request access to that key's OWN file", () => {
    const scope: ApiKeyRequestScope = {
      apiKey: "tenant-a-key-value",
      apiKeyId: "tenant-a-key-id",
      apiKeyMetadata: { scopes: [] } as unknown as ApiKeyRequestScope["apiKeyMetadata"],
      keyState: "valid",
      rejection: null,
      isSessionAuth: true,
    };
    assert.strictEqual(canAccessOwnedRecord(scope, "tenant-a-key-id"), true);
  });

  it("regression guard: a PURE session caller (no apiKeyId override) keeps unrestricted access", () => {
    const scope: ApiKeyRequestScope = {
      apiKey: null,
      apiKeyId: null,
      apiKeyMetadata: null,
      keyState: "none",
      rejection: null,
      isSessionAuth: true,
    };
    assert.strictEqual(canAccessOwnedRecord(scope, "any-tenant-key-id"), true);
  });

  it("regression guard: a PURE key caller (no session) is still scoped to its own records only", () => {
    const scope: ApiKeyRequestScope = {
      apiKey: "tenant-a-key-value",
      apiKeyId: "tenant-a-key-id",
      apiKeyMetadata: { scopes: [] } as unknown as ApiKeyRequestScope["apiKeyMetadata"],
      keyState: "valid",
      rejection: null,
      isSessionAuth: false,
    };
    assert.strictEqual(canAccessOwnedRecord(scope, "tenant-a-key-id"), true);
    assert.strictEqual(canAccessOwnedRecord(scope, "tenant-b-key-id"), false);
  });
});
