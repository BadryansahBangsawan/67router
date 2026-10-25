/**
 * Hard Rule #6: chatCore's provider-error bookkeeping is fail-open but must not be
 * silent. A step that throws is logged (sanitized) and the request still completes
 * with the upstream error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-chatcore-fail-open-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const { handleChatCore } = await import("../../open-sse/handlers/chatCore.ts");
const { logFailOpenError } = await import("../../open-sse/handlers/chatCore/failOpenLog.ts");

const originalFetch = globalThis.fetch;

type Entry = { level: string; tag: unknown; msg: unknown; meta?: unknown };
function createLog() {
  const entries: Entry[] = [];
  const push =
    (level: string) =>
    (tag: unknown, msg: unknown, meta?: unknown): void => {
      entries.push({ level, tag, msg, meta });
    };
  return {
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    entries,
  };
}

test.after(async () => {
  globalThis.fetch = originalFetch;
  // Let the fire-and-forget call-log write settle before the DB handle closes.
  await new Promise((resolve) => setTimeout(resolve, 100));
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("logFailOpenError logs a sanitized warning with stage + context", () => {
  const log = createLog();
  const err = new Error("boom at /home/someone/secret/path.ts:12\n    at fn (file.ts:1:1)");
  logFailOpenError(log, "TAG", "some stage", err, { provider: "p", model: "m" });
  assert.equal(log.entries.length, 1);
  const [entry] = log.entries;
  assert.equal(entry.level, "warn");
  assert.equal(entry.tag, "TAG");
  assert.match(String(entry.msg), /some stage failed \(continuing\)/);
  assert.doesNotMatch(String(entry.msg), /\n\s+at /, "stack trace stripped");
  assert.deepEqual(entry.meta, { stage: "some stage", provider: "p", model: "m" });
});

test("logFailOpenError never throws: missing logger or a throwing logger", () => {
  assert.doesNotThrow(() => logFailOpenError(null, "TAG", "s", new Error("x")));
  assert.doesNotThrow(() => logFailOpenError({}, "TAG", "s", new Error("x")));
  assert.doesNotThrow(() =>
    logFailOpenError(
      {
        warn: () => {
          throw new Error("logger down");
        },
      },
      "TAG",
      "s",
      new Error("x")
    )
  );
});

test("chatCore: a throwing bookkeeping step is logged and the upstream error still returns", async () => {
  const log = createLog();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { message: "You exceeded your current quota", type: "insufficient_quota" },
      }),
      { status: 429, headers: { "content-type": "application/json" } }
    );
  const body = {
    model: "kimi-for-coding",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  };
  try {
    const result = await handleChatCore({
      body: structuredClone(body),
      modelInfo: { provider: "kimi-coding", model: "kimi-for-coding", extendedContext: false },
      credentials: { apiKey: "sk-test" },
      log,
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: structuredClone(body),
        headers: new Headers({ accept: "application/json" }),
      },
      // No such connection row: the kimi limits refresh throws inside the bookkeeping.
      connectionId: "missing-connection-for-fail-open-test",
      userAgent: "unit-test",
    });
    assert.ok(result, "request completes");
    assert.equal(result.success, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const bookkeeping = log.entries.filter((e) => e.tag === "PROVIDER_ERROR_BOOKKEEPING");
  assert.ok(bookkeeping.length >= 1, "bookkeeping failure was logged");
  assert.equal(bookkeeping[0].level, "warn");
});
