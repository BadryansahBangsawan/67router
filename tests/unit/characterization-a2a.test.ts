// Characterization tests — src/lib/a2a (rail 3.8.55, Task 12 "caracterização B").
//
// Pins the A2A task state machine and the owner/auth helpers that the Conductor bridge and
// the /api/a2a/tasks routes still use (67router removed the protocol surface: JSON-RPC
// route, Agent Card, skills and the execute-with-state wrapper). Current behavior that looks wrong is pinned under
// `characterization: … currently …`.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import "../_setup/isolateDataDir.ts";

process.env.DISABLE_SQLITE_AUTO_BACKUP ||= "true";
// Hermetic env: the devbox shell may export these and they change auth/card behavior.
for (const name of [
  "OMNIROUTE_API_KEY",
  "REQUIRE_API_KEY",
  "CONDUCTOR_HUB_URL",
  "OMNIROUTE_A2A_MEMORY_HITS",
]) {
  delete process.env[name];
}
process.env.OMNIROUTE_BASE_URL = "http://a2a-char.test";

const core = await import("../../src/lib/db/core.ts");
const taskManagerModule = await import("../../src/lib/a2a/taskManager.ts");
const authenticateModule = await import("../../src/lib/a2a/authenticate.ts");

const { A2ATaskManager, getTaskManager } = taskManagerModule;

type Persisted = { upserts: unknown[]; events: Array<[string, string, string | undefined]> };

function inMemoryPersistence(): Persisted & {
  upsert: (row: unknown) => void;
  appendEvent: (id: string, type: string, data?: string) => void;
  purge: () => void;
} {
  const store: Persisted = { upserts: [], events: [] };
  return {
    ...store,
    upsert: (row) => store.upserts.push(row),
    appendEvent: (id, type, data) => store.events.push([id, type, data]),
    purge: () => {},
  };
}

const managers: Array<InstanceType<typeof A2ATaskManager>> = [];
function newManager() {
  const persistence = inMemoryPersistence();
  const tm = new A2ATaskManager(5, persistence as never);
  managers.push(tm);
  return { tm, persistence };
}

test.after(() => {
  for (const tm of managers) tm.destroy();
  getTaskManager().destroy();
  core.resetDbInstance();
});

// ─── (b) Skill handler via A2A_SKILL_HANDLERS ────────────────────────────────

test("task manager: lifecycle events, owner scoping, stats and persistence calls", () => {
  const { tm, persistence } = newManager();
  const mine = tm.createTask({ skill: "a", messages: [] }, "owner-a");
  const open = tm.createTask({ skill: "b", messages: [] });

  assert.equal(mine.state, "submitted");
  assert.equal(tm.getTask(mine.id, "owner-b"), undefined, "owned tasks are hidden from others");
  assert.equal(tm.getTask(open.id, "owner-b")?.id, open.id, "ownerless tasks are visible to all");
  assert.deepEqual(
    tm.listTasks(undefined, "owner-b").map((t) => t.id),
    [open.id]
  );

  tm.updateTask(mine.id, "working");
  tm.updateTask(mine.id, "completed", [{ type: "json", content: "{}" }]);
  assert.deepEqual(
    tm.getTask(mine.id, "owner-a")?.events.map((e) => e.state),
    ["submitted", "working", "completed"]
  );
  assert.deepEqual(tm.getStats().counts, {
    submitted: 1,
    working: 0,
    completed: 1,
    failed: 0,
    cancelled: 0,
  });
  assert.deepEqual(
    persistence.events.map(([, type]) => type),
    ["state:submitted", "state:submitted", "state:working", "state:completed"]
  );

  const cancelled = tm.cancelTask(open.id);
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.events.at(-1)?.message, "Cancelled by client");
});

test("auth helpers: owner id is a 32-hex sha256 prefix of the key; keyless posture allows the call", async () => {
  const keyed = new Request("http://a2a-char.test/a2a", {
    headers: { authorization: "Bearer sk-char-test-key" },
  });
  assert.equal(
    await authenticateModule.resolveA2AOwner(keyed),
    createHash("sha256").update("sk-char-test-key").digest("hex").slice(0, 32)
  );

  const keyless = new Request("http://a2a-char.test/a2a");
  assert.equal(await authenticateModule.resolveA2AOwner(keyless), undefined);
  assert.equal(await authenticateModule.authenticateA2ARequest(keyless), true);
});

test("auth helpers: an explicit OMNIROUTE_API_KEY requires a matching key", async () => {
  process.env.OMNIROUTE_API_KEY = "char-configured-key";
  try {
    const good = new Request("http://a2a-char.test/a2a", {
      headers: { authorization: "Bearer char-configured-key" },
    });
    const bad = new Request("http://a2a-char.test/a2a", {
      headers: { authorization: "Bearer wrong-key" },
    });
    assert.equal(await authenticateModule.authenticateA2ARequest(good), true);
    assert.equal(await authenticateModule.authenticateA2ARequest(bad), false);
  } finally {
    delete process.env.OMNIROUTE_API_KEY;
  }
});

// ─── (c) Invalid input — current behavior ────────────────────────────────────

test("task manager rejects unknown tasks and invalid transitions", () => {
  const { tm } = newManager();
  assert.throws(() => tm.updateTask("missing-id", "working"), /Task missing-id not found/);
  assert.throws(() => tm.cancelTask("missing-id"), /Task missing-id not found/);

  const task = tm.createTask({ skill: "x", messages: [] }, "owner-z");
  assert.throws(() => tm.cancelTask(task.id, "someone-else"), /not found/);
  // submitted → completed is not a legal transition (callers must move to working first).
  assert.throws(
    () => tm.updateTask(task.id, "completed"),
    /Invalid transition: submitted → completed/
  );
  tm.updateTask(task.id, "failed");
  assert.throws(() => tm.updateTask(task.id, "working"), /Invalid transition: failed → working/);
});
