/**
 * Anonymous-owner rules of the owner-scoped /v1 helpers (#14332). Originally covered through the
 * removed /v1/files routes; the helpers stay in use by the media store (`mediaSink.ts`,
 * `/v1/media/[id]`), so the ownership contract is pinned here directly.
 */
import { describe, it } from "node:test";
import assert from "node:assert";

const { ANONYMOUS_OWNER_ID } = await import("../../src/shared/constants/anonymousOwner.ts");
const { canAccessOwnedRecord, resolveEffectiveApiKeyId } =
  await import("../../src/app/api/v1/_helpers/apiKeyScope.ts");

describe("#14332 anonymous owner isolation", () => {
  it("resolveEffectiveApiKeyId() resolves a session-only caller (no key) to null, NOT the anonymous sentinel", () => {
    const effective = resolveEffectiveApiKeyId({ apiKeyId: null, isSessionAuth: true }, null);
    assert.strictEqual(
      effective,
      null,
      "a dashboard-session caller with no key must not be folded into the shared anonymous owner " +
        "(that would make session-created rows readable by any anonymous caller)"
    );
  });

  it("an authenticated tenant's key can never access the anonymous owner's record", () => {
    const tenantScope = { isSessionAuth: false, apiKeyId: "tenant-a-real-key-id" };
    assert.strictEqual(canAccessOwnedRecord(tenantScope, ANONYMOUS_OWNER_ID), false);
  });

  it("the anonymous owner can never access an authenticated tenant's record", () => {
    const anonScope = { isSessionAuth: false, apiKeyId: ANONYMOUS_OWNER_ID };
    assert.strictEqual(canAccessOwnedRecord(anonScope, "tenant-a-real-key-id"), false);
  });
});
