/**
 * A2A error paths must not echo raw exception text (filesystem paths, stack
 * frames, credentials) to the caller — they route through sanitizeErrorMessage()
 * like every other public error boundary (docs/security/ERROR_SANITIZATION.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omni-a2a-err-sanitize-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "a2a-err-sanitize-secret";
process.env.OMNIROUTE_DISABLE_REDIS_AUTH_CACHE = "1";

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const route = await import("../../src/app/a2a/route.ts");
const { A2A_SKILL_HANDLERS } = await import("../../src/lib/a2a/taskExecution.ts");
const { createA2AStream } = await import("../../src/lib/a2a/streaming.ts");

const ORIGINAL_REQUIRE = process.env.REQUIRE_API_KEY;
const ORIGINAL_A2A_KEY = process.env.OMNIROUTE_API_KEY;
const ORIGINAL_HANDLER = A2A_SKILL_HANDLERS["smart-routing"];

const LEAKY_PATH = "/Users/alice/omniroute/src/lib/internal/secretModule.ts";
const LEAKY_TOKEN = "sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD";
const LEAKY_MESSAGE = `upstream failed at ${LEAKY_PATH}:42 using ${LEAKY_TOKEN}`;

test.before(async () => {
  delete process.env.REQUIRE_API_KEY;
  delete process.env.OMNIROUTE_API_KEY;
  await settingsDb.updateSettings({ a2aEnabled: true });
});

test.after(() => {
  A2A_SKILL_HANDLERS["smart-routing"] = ORIGINAL_HANDLER;
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_REQUIRE === undefined) delete process.env.REQUIRE_API_KEY;
  else process.env.REQUIRE_API_KEY = ORIGINAL_REQUIRE;
  if (ORIGINAL_A2A_KEY === undefined) delete process.env.OMNIROUTE_API_KEY;
  else process.env.OMNIROUTE_API_KEY = ORIGINAL_A2A_KEY;
});

function rpc(method: string, params: Record<string, unknown>) {
  return route.POST(
    new Request("http://localhost/a2a", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }) as never
  );
}

function assertNoLeak(text: string) {
  assert.ok(!text.includes(LEAKY_PATH), `absolute path leaked: ${text}`);
  assert.ok(!text.includes(LEAKY_TOKEN), `credential leaked: ${text}`);
}

test("message/send failure does not echo raw exception text", async () => {
  A2A_SKILL_HANDLERS["smart-routing"] = async () => {
    throw new Error(LEAKY_MESSAGE);
  };
  try {
    const res = await rpc("message/send", { messages: [{ role: "user", content: "hi" }] });
    const body = (await res.json()) as { error?: { code?: number; message?: string } };
    assert.equal(body.error?.code, -32603);
    assert.match(body.error?.message ?? "", /^Skill execution failed/);
    assertNoLeak(JSON.stringify(body));

    // The stored failure is returned by tasks/get — it must be sanitized too.
    const { getTaskManager } = await import("../../src/lib/a2a/taskManager.ts");
    const failed = getTaskManager().listTasks({ state: "failed" });
    assert.ok(failed.length > 0, "the failed task must be recorded");
    const getRes = await rpc("tasks/get", { taskId: failed[0].id });
    const getBody = await getRes.json();
    assert.equal(getBody.result?.task?.state, "failed");
    assertNoLeak(JSON.stringify(getBody));
  } finally {
    A2A_SKILL_HANDLERS["smart-routing"] = ORIGINAL_HANDLER;
  }
});

test("streaming failure event does not echo raw exception text", async () => {
  const stream = createA2AStream({ id: "task-sanitize-1" } as never, async () => {
    throw new Error(LEAKY_MESSAGE);
  });
  const text = await new Response(stream).text();
  assert.match(text, /"state":"failed"/);
  assertNoLeak(text);
});
