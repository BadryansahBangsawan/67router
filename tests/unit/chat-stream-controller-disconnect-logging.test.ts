/**
 * Hard Rule #6: client-disconnect finalisation in chatStreamController is
 * fail-open (every step runs, nothing throws to the stream) but a failing step
 * must be logged with provider / model / requestId context.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { createChatStreamController } =
  await import("../../open-sse/handlers/chatCore/chatStreamController.ts");

type Entry = { tag: unknown; msg: unknown; meta?: Record<string, unknown> };
function createLog() {
  const warnings: Entry[] = [];
  return {
    warn: (tag: unknown, msg: unknown, meta?: Record<string, unknown>) => {
      warnings.push({ tag, msg, meta });
    },
    warnings,
  };
}

function build(overrides: Record<string, unknown>) {
  return createChatStreamController({
    getClientDisconnectFinalize: () => null,
    getPipelineStreamError: () => null,
    pendingScope: { id: "scope" },
    finalizePendingScope: () => undefined,
    onDisconnect: null,
    provider: "openai",
    model: "gpt-test",
    connectionId: null,
    pendingRequestId: "req-123",
    clientResponseFormat: null,
    clientAbortSignal: null,
    allowCompletedToolHandoffGrace: false,
    ...overrides,
  });
}

test("every throwing disconnect step is logged with context and the rest still run", () => {
  const log = createLog();
  let finalizeCalls = 0;
  let userCalls = 0;
  const controller = build({
    log,
    getClientDisconnectFinalize: () => () => {
      throw new Error("tail finalizer exploded");
    },
    finalizePendingScope: () => {
      finalizeCalls++;
      throw new Error("pending scope write failed");
    },
    onDisconnect: () => {
      userCalls++;
      throw new Error("caller onDisconnect failed");
    },
  });

  assert.doesNotThrow(() => controller.handleDisconnect("client_closed"));
  assert.equal(finalizeCalls, 1, "falls back to pending-scope finalisation");
  assert.equal(userCalls, 1, "caller onDisconnect still runs");

  assert.equal(log.warnings.length, 3);
  const messages = log.warnings.map((w) => String(w.msg));
  assert.match(messages[0], /tail finalizer exploded/);
  assert.match(messages[1], /pending scope write failed/);
  assert.match(messages[2], /caller onDisconnect failed/);
  for (const w of log.warnings) {
    assert.equal(w.tag, "STREAM_DISCONNECT");
    assert.equal(w.meta?.provider, "openai");
    assert.equal(w.meta?.model, "gpt-test");
    assert.equal(w.meta?.requestId, "req-123");
  }
});

test("a clean disconnect logs nothing", () => {
  const log = createLog();
  const controller = build({ log });
  controller.handleDisconnect("client_closed");
  assert.equal(log.warnings.length, 0);
});

test("no logger supplied: still fail-open", () => {
  const controller = build({
    finalizePendingScope: () => {
      throw new Error("x");
    },
  });
  assert.doesNotThrow(() => controller.handleDisconnect("client_closed"));
});
