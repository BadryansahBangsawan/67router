import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-openapi-try-route-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.INITIAL_PASSWORD = "openapi-try-password";
process.env.JWT_SECRET = "openapi-try-jwt-secret";

const core = await import("../../src/lib/db/core.ts");
const route = await import("../../src/app/api/openapi/try/route.ts");

const originalFetch = globalThis.fetch;

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function createAuthCookie() {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret);
  return `auth_token=${token}`;
}

function makeRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/openapi/try", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(async () => {
  await resetStorage();
  globalThis.fetch = originalFetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  globalThis.fetch = originalFetch;
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  if (ORIGINAL_DATA_DIR === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  }
  if (ORIGINAL_INITIAL_PASSWORD === undefined) {
    delete process.env.INITIAL_PASSWORD;
  } else {
    process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  }
  if (ORIGINAL_JWT_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  }
});

test("openapi try route requires management authentication before proxying", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("unexpected");
  };

  const response = await route.POST(
    makeRequest({
      method: "GET",
      path: "/api/monitoring/health",
    }) as any
  );
  const body = (await response.json()) as any;

  assert.equal(response.status, 401);
  assert.equal(body.error.message, "Authentication required");
  assert.equal(fetchCalled, false);
});

test("openapi try route rejects protocol-relative targets after authentication", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("unexpected");
  };

  const response = await route.POST(
    makeRequest(
      {
        method: "GET",
        path: "//evil.example/api",
      },
      await createAuthCookie()
    ) as any
  );
  const body = (await response.json()) as any;

  assert.equal(response.status, 400);
  assert.equal(body.error.message, "Invalid request");
  assert.equal(fetchCalled, false);
});

test("openapi try route strips hop-by-hop headers and proxies same-origin API paths", async () => {
  const cookie = await createAuthCookie();
  let fetchUrl = "";
  let fetchInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    fetchUrl = String(url);
    fetchInit = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await route.POST(
    makeRequest(
      {
        method: "POST",
        path: "/api/combos/test",
        headers: {
          Authorization: "Bearer test-key",
          Host: "evil.example",
          "X-Forwarded-Proto": "https",
        },
        body: { comboName: "smoke" },
      },
      cookie
    ) as any
  );
  const body = (await response.json()) as any;
  const forwardedHeaders = fetchInit?.headers as Record<string, string>;

  assert.equal(response.status, 200);
  assert.equal(body.status, 200);
  assert.equal(fetchUrl, "http://localhost/api/combos/test");
  assert.equal(fetchInit?.method, "POST");
  assert.equal(forwardedHeaders.Authorization, "Bearer test-key");
  assert.equal(forwardedHeaders.Host, undefined);
  assert.equal(forwardedHeaders["X-Forwarded-Proto"], undefined);
  assert.equal(forwardedHeaders.Cookie, cookie);
});

type TryRequest = Parameters<typeof route.POST>[0];

function makeRemoteRequest(body: unknown, cookie: string) {
  return new Request("http://localhost/api/openapi/try", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      // Post-pipeline locality verdict, trusted only while a stamp token exists.
      "x-omniroute-peer-locality": "remote",
    },
    body: JSON.stringify(body),
  });
}

async function withStampToken<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.OMNIROUTE_PEER_STAMP_TOKEN;
  process.env.OMNIROUTE_PEER_STAMP_TOKEN = "openapi-try-stamp-token";
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.OMNIROUTE_PEER_STAMP_TOKEN;
    else process.env.OMNIROUTE_PEER_STAMP_TOKEN = original;
  }
}

test("openapi try route refuses local-only targets for a remote caller", async () => {
  const cookie = await createAuthCookie();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("unexpected");
  };

  for (const target of [
    { method: "POST", path: "/api/services/9router/start" },
    { method: "GET", path: "/api/cli-tools/status" },
    { method: "POST", path: "/api/settings/mitm" },
  ]) {
    const response = await withStampToken(() =>
      route.POST(makeRemoteRequest(target, cookie) as unknown as TryRequest)
    );
    assert.equal(response.status, 403, `${target.method} ${target.path}`);
  }
  assert.equal(fetchCalled, false);
});

test("openapi try route validates the resolved path, not the raw string", async () => {
  const cookie = await createAuthCookie();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("unexpected");
  };

  const response = await route.POST(
    makeRequest({ method: "GET", path: "/v1/../dashboard" }, cookie) as unknown as TryRequest
  );
  assert.equal(response.status, 400);

  const traversal = await withStampToken(() =>
    route.POST(
      makeRemoteRequest(
        { method: "POST", path: "/v1/../api/services/9router/start" },
        cookie
      ) as unknown as TryRequest
    )
  );
  assert.equal(traversal.status, 403);
  assert.equal(fetchCalled, false);
});

test("openapi try route marks remote callers' inner request as proxied", async () => {
  const cookie = await createAuthCookie();
  let fetchInit: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    fetchInit = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await withStampToken(() =>
    route.POST(
      makeRemoteRequest({ method: "GET", path: "/v1/models" }, cookie) as unknown as TryRequest
    )
  );
  assert.equal(response.status, 200);
  const headers = fetchInit?.headers as Record<string, string>;
  assert.ok(headers.Via, "inner request must carry a proxy-hop marker");
});

test("openapi try route still proxies local-only targets for a loopback caller", async () => {
  const cookie = await createAuthCookie();
  let fetchUrl = "";
  let fetchInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    fetchUrl = String(url);
    fetchInit = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await route.POST(
    makeRequest({ method: "GET", path: "/api/cli-tools/status" }, cookie) as unknown as TryRequest
  );
  assert.equal(response.status, 200);
  assert.equal(fetchUrl, "http://localhost/api/cli-tools/status");
  assert.equal((fetchInit?.headers as Record<string, string>).Via, undefined);
});
