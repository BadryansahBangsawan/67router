/**
 * 67router PR-2 removed the public A2A protocol surface (/a2a, the Agent Card, the
 * built-in skills). The task store stays because Conductor mirrors hub tasks into it
 * and the Orchestration dashboard reads it back. This pins that boundary so a later
 * cleanup cannot take the kept half with it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const KEPT_ROUTES: Record<string, string[]> = {
  "src/app/api/a2a/tasks/route.ts": ["GET", "POST"],
  "src/app/api/a2a/tasks/history/route.ts": ["GET"],
  "src/app/api/a2a/tasks/[id]/route.ts": ["GET"],
  "src/app/api/a2a/tasks/[id]/cancel/route.ts": ["POST"],
};

for (const [rel, methods] of Object.entries(KEPT_ROUTES)) {
  test(`kept A2A task route ${rel} still exports ${methods.join(", ")}`, () => {
    const src = read(rel);
    for (const m of methods) {
      assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${m}\\b`), `${rel} lost ${m}`);
    }
  });
}

test("the A2A TaskManager and its DB module keep their public entry points", async () => {
  const tm = await import("../../src/lib/a2a/taskManager.ts");
  assert.equal(typeof tm.getTaskManager, "function");
  assert.equal(typeof tm.A2ATaskManager, "function");
  const db = await import("../../src/lib/db/a2aTasks.ts");
  for (const fn of ["upsertA2ATask", "appendA2ATaskEvent", "listA2ATaskHistory"] as const) {
    assert.equal(typeof db[fn], "function", `${fn} missing`);
  }
});

test("Conductor still mirrors its tasks into the A2A task store", () => {
  const bridge = read("src/lib/conductor/bridge.ts") + read("src/lib/conductor/boot.ts");
  assert.match(bridge, /a2a/i, "Conductor no longer references the A2A task store");
});
