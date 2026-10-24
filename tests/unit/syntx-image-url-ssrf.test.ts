/**
 * The Syntx executor downloads a client-supplied `https://` image_url and
 * re-uploads the bytes to syntx.ai. That download must use the SSRF-hardened
 * untrusted-image fetch (public-only, DNS-pinned, guarded redirects), so a
 * request body cannot make the server reach loopback / link-local / LAN hosts.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../../open-sse/executors/syntx.ts");
const sessions = await import("../../open-sse/services/syntxSessions.ts");
const remoteImageFetch = await import("../../src/shared/network/remoteImageFetch.ts");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function fakeJwt(): string {
  return (
    "eyJhbGciOiJub25lIn0." +
    Buffer.from(JSON.stringify({ sub: "1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
      "base64url"
    ) +
    ".x"
  );
}

function sseFrame(obj: unknown): string {
  return `data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`;
}

function installSyntxMock(imageUrls: Set<string>) {
  const seen: string[] = [];
  let generateBody: Record<string, unknown> | null = null;
  const mock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push(url);
    if (imageUrls.has(url)) {
      return new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } });
    }
    if (url.endsWith("/api/v1/chats") && init?.method === "POST") {
      return new Response(JSON.stringify({ uuid: "ssrf-chat" }), { status: 200 });
    }
    if (url.endsWith("/api/v1/chats/upload-files")) {
      return new Response(
        JSON.stringify({ files: [{ url: "https://r2.syntx.ai/user/uploaded/y.png" }] }),
        { status: 200 }
      );
    }
    if (url.includes("/api/v1/llm/generate")) {
      generateBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ job_id: "job", stream_url: "https://sse.syntx.ai/stream/job?token=t" }),
        { status: 200 }
      );
    }
    if (url.startsWith("https://sse.syntx.ai/stream/")) {
      return new Response(sseFrame({ type: "content", content: "ok" }) + sseFrame("[DONE]"), {
        status: 200,
      });
    }
    if (url.includes("/api/v1/llm/models")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { mock, seen, getGenerateBody: () => generateBody };
}

async function runWithImage(imageUrl: string) {
  const executor = new mod.SyntxExecutor();
  return executor.execute({
    model: "gpt-5-nano-2025-08-07",
    body: {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    },
    stream: false,
    credentials: { apiKey: fakeJwt() },
    signal: null,
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  remoteImageFetch.setPinnedFetchTestOverride(undefined);
});

describe("Syntx image_url download is SSRF-guarded", () => {
  for (const internal of [
    "https://169.254.169.254/latest/meta-data/iam.png",
    "https://127.0.0.1/admin.png",
    "https://10.0.0.5/internal.png",
  ]) {
    it(`never fetches ${internal}`, async () => {
      sessions.__resetSyntxSessionsForTests();
      const { mock, seen, getGenerateBody } = installSyntxMock(new Set([internal]));
      globalThis.fetch = mock;
      remoteImageFetch.setPinnedFetchTestOverride(mock);

      const result = await runWithImage(internal);
      assert.equal(result.response.status, 200, "the chat still proceeds without the image");
      assert.ok(!seen.includes(internal), `internal URL was fetched: ${internal}`);
      const files = (getGenerateBody()?.files as unknown[] | undefined) ?? [];
      assert.equal(files.length, 0);
    });
  }

  it("still downloads and attaches a public https image", async () => {
    sessions.__resetSyntxSessionsForTests();
    const publicUrl = "https://93.184.216.34/cat.png";
    const { mock, seen, getGenerateBody } = installSyntxMock(new Set([publicUrl]));
    globalThis.fetch = mock;
    remoteImageFetch.setPinnedFetchTestOverride(mock);

    const result = await runWithImage(publicUrl);
    assert.equal(result.response.status, 200);
    assert.ok(seen.includes(publicUrl));
    const files = getGenerateBody()?.files as Array<{ object_url: string }>;
    assert.equal(files?.[0]?.object_url, "https://r2.syntx.ai/user/uploaded/y.png");
  });
});
