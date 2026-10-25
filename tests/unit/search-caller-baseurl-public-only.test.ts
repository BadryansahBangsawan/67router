/**
 * A caller-supplied `provider_options.baseUrl` (SearXNG opt-in) is untrusted
 * input: it must resolve to a public host, the connection is pinned to the
 * checked address, and redirects are not followed. The operator-configured base
 * URL on the provider connection keeps loopback/LAN support (self-hosted).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-search-caller-baseurl-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const searchRoute = await import("../../src/app/api/v1/search/route.ts");
const { resolveSearchBaseUrl } = await import("../../open-sse/handlers/search/baseUrl.ts");
const { SEARCH_PROVIDERS } = await import("../../open-sse/config/searchRegistry.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const searxng = SEARCH_PROVIDERS["searxng-search"];
const base = { query: "q", searchType: "web", maxResults: 5 } as never;

test("caller baseUrl pointing at loopback / LAN / localhost is refused", () => {
  for (const baseUrl of [
    "http://127.0.0.1:8888/search",
    "http://10.0.0.5:8888",
    "http://192.168.1.10",
    "http://localhost:8888",
    "http://[::1]:8888",
  ]) {
    assert.throws(
      () => resolveSearchBaseUrl(searxng, { ...(base as object), providerOptions: { baseUrl } }),
      `caller baseUrl ${baseUrl} must be refused`
    );
  }
});

test("caller baseUrl on a public host is still accepted", () => {
  assert.equal(
    resolveSearchBaseUrl(searxng, {
      ...(base as object),
      providerOptions: { baseUrl: "https://searx.example.org/" },
    }),
    "https://searx.example.org"
  );
});

test("operator-configured baseUrl keeps loopback/LAN support", () => {
  assert.equal(
    resolveSearchBaseUrl(searxng, {
      ...(base as object),
      providerSpecificData: { baseUrl: "http://127.0.0.1:8888/search" },
    }),
    "http://127.0.0.1:8888/search"
  );
});

function searchRequest(baseUrl: string) {
  return searchRoute.POST(
    new Request("http://localhost/api/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "meta search",
        provider: "searxng-search",
        provider_options: { baseUrl },
      }),
    })
  );
}

test("/v1/search refuses a loopback caller baseUrl without fetching it", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    const response = await searchRequest("http://127.0.0.1:9090/custom-search");
    assert.notEqual(response.status, 200);
    assert.ok(
      !calls.some((u) => u.startsWith("http://127.0.0.1:9090")),
      `loopback caller baseUrl was fetched: ${calls.join(", ")}`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/v1/search does not follow a redirect from a caller baseUrl", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), redirect: init?.redirect });
    if (String(url).startsWith("http://93.184.216.34/")) {
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:9090/internal" },
      });
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    const response = await searchRequest("http://93.184.216.34/searx");
    assert.notEqual(response.status, 200);
    const upstream = calls.filter((c) => c.url.startsWith("http://93.184.216.34/"));
    assert.equal(upstream.length, 1, "the caller host is contacted once");
    assert.equal(upstream[0].redirect, "manual", "redirects must not be auto-followed");
    assert.ok(!calls.some((c) => c.url.startsWith("http://127.0.0.1:9090")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("untrusted target without an injected guarded fetch never reaches the network", async () => {
  const { executeProviderFetch } = await import("../../open-sse/handlers/search/searchProxy.ts");
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch;
  try {
    const controller = new AbortController();
    const result = await executeProviderFetch({
      config: searxng,
      url: "http://127.0.0.1:8888/search?q=q",
      init: { method: "GET" },
      controller,
      timer: setTimeout(() => {}, 0),
      query: "q",
      searchType: "web",
      maxResults: 5,
      startTime: Date.now(),
      proxy: null,
      proxyLevel: "none",
      untrustedTarget: true,
      normalize: () => ({ results: [], totalResults: 0 }),
    });
    assert.equal(called, false, "plain fetch must not be used for an untrusted target");
    assert.equal(result.success, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
