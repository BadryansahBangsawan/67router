/**
 * systemMessageMustBeFirst() lives in the translator (open-sse/translator/helpers/
 * systemMessagePolicy.ts) and drives the strict-system hoist (#6135, #7293).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  systemMessageMustBeFirst,
  parseStrictSystemProvidersEnv,
} from "../../open-sse/translator/helpers/systemMessagePolicy.ts";

describe("systemMessageMustBeFirst (#6135)", () => {
  it("flags xiaomi-mimo, mimo and tokenrouter as system-must-be-first", () => {
    assert.equal(systemMessageMustBeFirst("xiaomi-mimo"), true);
    assert.equal(systemMessageMustBeFirst("mimo"), true);
    // tokenrouter: confirmed live 2026-08-22 — mid-array system message -> HTTP 400.
    assert.equal(systemMessageMustBeFirst("tokenrouter"), true);
    assert.equal(systemMessageMustBeFirst("TokenRouter"), true); // case-insensitive
    // default: unlisted providers keep current (non-first-constrained) behavior
    assert.equal(systemMessageMustBeFirst("anthropic"), false);
    assert.equal(systemMessageMustBeFirst(null), false);
    assert.equal(systemMessageMustBeFirst(undefined), false);
  });
});

describe("OMNIROUTE_STRICT_SYSTEM_PROVIDERS env override", () => {
  it("is a no-op when unset or empty", () => {
    assert.deepEqual(parseStrictSystemProvidersEnv({}), []);
    assert.deepEqual(parseStrictSystemProvidersEnv({ OMNIROUTE_STRICT_SYSTEM_PROVIDERS: "" }), []);
    assert.equal(systemMessageMustBeFirst("coding-agent", {}), false);
  });

  it("extends the built-in set without removing xiaomi-mimo/mimo", () => {
    const env = { OMNIROUTE_STRICT_SYSTEM_PROVIDERS: "coding-agent" };
    assert.equal(systemMessageMustBeFirst("coding-agent", env), true);
    assert.equal(systemMessageMustBeFirst("xiaomi-mimo", env), true);
    assert.equal(systemMessageMustBeFirst("mimo", env), true);
    assert.equal(systemMessageMustBeFirst("anthropic", env), false);
  });

  it("is case-insensitive and trims whitespace around comma-separated ids", () => {
    const env = { OMNIROUTE_STRICT_SYSTEM_PROVIDERS: " Coding-Agent , My-Backend  " };
    assert.deepEqual(parseStrictSystemProvidersEnv(env), ["coding-agent", "my-backend"]);
    assert.equal(systemMessageMustBeFirst("CODING-AGENT", env), true);
    assert.equal(systemMessageMustBeFirst("my-backend", env), true);
  });

  it("ignores empty entries from stray/trailing commas", () => {
    const env = { OMNIROUTE_STRICT_SYSTEM_PROVIDERS: "coding-agent,,  ,my-backend," };
    assert.deepEqual(parseStrictSystemProvidersEnv(env), ["coding-agent", "my-backend"]);
  });
});
