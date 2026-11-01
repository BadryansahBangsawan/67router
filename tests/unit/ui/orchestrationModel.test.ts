/**
 * tests/unit/ui/orchestrationModel.test.ts
 * Run: node --import tsx/esm --test tests/unit/ui/orchestrationModel.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ORCH_STATES,
  orchStateColor,
  orchStateBadgeBg,
} from "../../../src/app/(dashboard)/dashboard/orchestration/model/orchestrationTypes.ts";
import { fromA2A } from "../../../src/app/(dashboard)/dashboard/orchestration/model/fromA2A.ts";
import type { A2ATask } from "../../../src/lib/a2a/taskManager.ts";
import { fromConductor } from "../../../src/app/(dashboard)/dashboard/orchestration/model/fromConductor.ts";
import type { FleetSnapshot } from "../../../src/lib/conductor/hubProxy.ts";
import { mergeSnapshot } from "../../../src/app/(dashboard)/dashboard/orchestration/model/mergeSnapshot.ts";
import {
  STALE_COMPLETED_MS,
  MAX_WORK_NODES,
} from "../../../src/app/(dashboard)/dashboard/orchestration/model/orchestrationTypes.ts";

describe("orchestrationTypes", () => {
  it("covers all six states with a theme-aware CSS var color each", () => {
    assert.equal(ORCH_STATES.length, 6);
    for (const s of ORCH_STATES) {
      assert.match(orchStateColor(s), /^var\(--orch-status-[a-z]+\)$/, s);
    }
  });
  it("waiting_approval maps to the approval token", () => {
    assert.equal(orchStateColor("waiting_approval"), "var(--orch-status-approval)");
  });
  it("running maps to warning, succeeded to success, failed to error", () => {
    assert.equal(orchStateColor("running"), "var(--orch-status-warning)");
    assert.equal(orchStateColor("succeeded"), "var(--orch-status-success)");
    assert.equal(orchStateColor("failed"), "var(--orch-status-error)");
  });
  it("queued and cancelled both map to the muted token", () => {
    assert.equal(orchStateColor("queued"), "var(--orch-status-muted)");
    assert.equal(orchStateColor("cancelled"), "var(--orch-status-muted)");
  });
  it("orchStateBadgeBg produces a color-mix over the matching state token", () => {
    for (const s of ORCH_STATES) {
      const bg = orchStateBadgeBg(s);
      assert.match(bg, /^color-mix\(in srgb, var\(--orch-status-[a-z]+\) 13%, transparent\)$/, s);
      assert.ok(bg.includes(orchStateColor(s)), `${s} badge bg should embed its own token`);
    }
  });
});

function a2aTask(over: Partial<A2ATask>): A2ATask {
  return {
    id: "a1",
    skill: "smart-routing",
    state: "working",
    input: { skill: "smart-routing", messages: [{ role: "user", content: "route this well" }] },
    artifacts: [],
    events: [{ timestamp: "2026-08-30T10:00:00Z", state: "submitted" }],
    metadata: {},
    createdAt: "2026-08-30T10:00:00Z",
    updatedAt: "2026-08-30T10:01:00Z",
    expiresAt: "2026-08-30T10:05:00Z",
    ...over,
  } as A2ATask;
}

describe("fromA2A", () => {
  it("maps the five A2A states", () => {
    const cases: Array<[A2ATask["state"], string]> = [
      ["submitted", "queued"],
      ["working", "running"],
      ["completed", "succeeded"],
      ["failed", "failed"],
      ["cancelled", "cancelled"],
    ];
    for (const [input, expected] of cases) {
      const { nodes } = fromA2A([a2aTask({ state: input })]);
      assert.equal(nodes.find((n) => n.kind === "work")?.state, expected, input);
    }
  });
  it("work node id is a2a:<id>, label is the skill", () => {
    const { nodes } = fromA2A([a2aTask({})]);
    const w = nodes.find((n) => n.kind === "work");
    assert.equal(w?.id, "a2a:a1");
    assert.equal(w?.label, "smart-routing");
  });
  it("empty input emits nothing", () => {
    assert.equal(fromA2A([]).nodes.length, 0);
  });
});

const baseSnap: FleetSnapshot = {
  offline: false,
  runners: [{ id: "r1", name: "runner-one", clis: ["claude"], online: true, draining: false }],
  tasks: [
    {
      id: "ct1",
      status: "running",
      mode: "auto",
      repo: "acme/app",
      runner: "r1",
      summary: "Refactor auth",
      branch: null,
      error: null,
      updated_at: "2026-08-30T10:00:00Z",
    },
  ],
};

describe("fromConductor", () => {
  it("online runner with a running task → running WorkNode + ActivityNode for the task", () => {
    const { nodes, edges } = fromConductor(baseSnap);
    const runner = nodes.find((n) => n.id === "conductor:runner:r1");
    assert.equal(runner?.state, "running");
    const act = nodes.find((n) => n.id === "conductor:task:ct1");
    assert.equal(act?.kind, "activity");
    assert.ok(edges.some((e) => e.from === "conductor:runner:r1" && e.to === "conductor:task:ct1"));
  });
  it("queued task without runner hangs directly under the source as a work node", () => {
    const snap: FleetSnapshot = {
      ...baseSnap,
      runners: [],
      tasks: [{ ...baseSnap.tasks[0], id: "ct2", status: "queued", runner: null }],
    };
    const { nodes, edges } = fromConductor(snap);
    const w = nodes.find((n) => n.id === "conductor:task:ct2");
    assert.equal(w?.kind, "work");
    assert.equal(w?.state, "queued");
    assert.ok(edges.some((e) => e.from === "source:conductor" && e.to === "conductor:task:ct2"));
  });
  it("offline snapshot emits only nothing (hook marks the source offline separately)", () => {
    const out = fromConductor({ offline: true, runners: [], tasks: [] });
    assert.equal(out.nodes.length, 0);
  });
  it("unknown hub status maps to failed with the raw value in sublabel", () => {
    const snap: FleetSnapshot = {
      ...baseSnap,
      runners: [],
      tasks: [{ ...baseSnap.tasks[0], id: "ct3", status: "vaporized", runner: null }],
    };
    const w = fromConductor(snap).nodes.find((n) => n.id === "conductor:task:ct3");
    assert.equal(w?.state, "failed");
    assert.match(w?.sublabel ?? "", /vaporized/);
  });
  it("running task whose runner is not present in snap.runners is emitted as a work node, not swallowed", () => {
    const snap: FleetSnapshot = {
      offline: false,
      runners: [],
      tasks: [
        {
          ...baseSnap.tasks[0],
          id: "ct-orphan",
          status: "running",
          runner: "ghost-runner",
        },
      ],
    };
    const { nodes, edges } = fromConductor(snap);
    const w = nodes.find((n) => n.id === "conductor:task:ct-orphan");
    assert.equal(w?.kind, "work");
    assert.equal(w?.state, "running");
    assert.ok(
      edges.some((e) => e.from === "source:conductor" && e.to === "conductor:task:ct-orphan")
    );
  });
});

const OK_SOURCES = [
  { source: "a2a" as const, ok: true },
  { source: "conductor" as const, ok: true },
];
const NOW = Date.parse("2026-08-30T12:00:00Z");
const empty = { nodes: [], edges: [] };

describe("mergeSnapshot", () => {
  it("adds the orchestrator root and root→source edges", () => {
    const snap = mergeSnapshot({ a2a: fromA2A([a2aTask({})]), conductor: empty }, OK_SOURCES, {
      now: NOW,
    });
    assert.ok(snap.nodes.some((n) => n.id === "orchestrator"));
    assert.ok(snap.edges.some((e) => e.from === "orchestrator" && e.to === "source:a2a"));
  });
  it("dedupes a Conductor-mirrored A2A task into one node with a mirror edge", () => {
    const a2a = fromA2A([
      a2aTask({ id: "am1", skill: "conductor", metadata: { conductor: { task_id: "ct1" } } }),
    ]);
    const conductor = fromConductor(baseSnap); // contains conductor:task:ct1 as activity of r1
    const snap = mergeSnapshot({ a2a, conductor }, OK_SOURCES, { now: NOW });
    assert.ok(
      !snap.nodes.some((n) => n.id === "a2a:am1"),
      "mirrored A2A work node must be dropped"
    );
    const mirrorEdge = snap.edges.find((e) => e.kind === "mirror");
    assert.equal(mirrorEdge?.to, "source:a2a");
  });
  it("drops terminal work older than STALE_COMPLETED_MS unless showCompleted", () => {
    const old = a2aTask({
      id: "old",
      state: "completed",
      updatedAt: new Date(NOW - STALE_COMPLETED_MS - 1000).toISOString(),
    });
    const parts = { a2a: fromA2A([old]), conductor: empty };
    assert.ok(
      !mergeSnapshot(parts, OK_SOURCES, { now: NOW }).nodes.some((n) => n.id === "a2a:old")
    );
    assert.ok(
      mergeSnapshot(parts, OK_SOURCES, { now: NOW, showCompleted: true }).nodes.some(
        (n) => n.id === "a2a:old"
      )
    );
  });
  it("caps work nodes at MAX_WORK_NODES with a per-source overflow node", () => {
    const many = Array.from({ length: MAX_WORK_NODES + 10 }, (_, i) =>
      a2aTask({ id: `m${i}`, updatedAt: new Date(NOW - i * 1000).toISOString() })
    );
    const snap = mergeSnapshot({ a2a: fromA2A(many), conductor: empty }, OK_SOURCES, { now: NOW });
    const works = snap.nodes.filter((n) => n.kind === "work");
    assert.ok(works.length <= MAX_WORK_NODES, `got ${works.length}`);
    const overflow = snap.nodes.find((n) => n.id === "overflow:a2a");
    assert.ok(overflow, "overflow node expected");
  });
  it("keeps SourceStatus[] verbatim on the snapshot", () => {
    const src = [{ source: "conductor" as const, ok: false, offline: true }];
    const snap = mergeSnapshot({ a2a: empty, conductor: empty }, src, {
      now: NOW,
    });
    assert.deepEqual(snap.sources, src);
  });
  it("does not mutate input node objects when deduping (honors the Pure contract)", () => {
    const a2a = fromA2A([
      a2aTask({ id: "am2", skill: "conductor", metadata: { conductor: { task_id: "ct1" } } }),
    ]);
    const conductor = fromConductor(baseSnap); // contains conductor:task:ct1 as activity of r1
    const originalNode = conductor.nodes.find((n) => n.id === "conductor:task:ct1");
    assert.ok(originalNode, "conductor:task:ct1 must exist in the source part");
    const snap = mergeSnapshot({ a2a, conductor }, OK_SOURCES, { now: NOW });
    assert.equal(
      "mirrorOf" in (originalNode as object),
      false,
      "the original conductor input node must not be mutated"
    );
    const mergedNode = snap.nodes.find((n) => n.id === "conductor:task:ct1");
    assert.equal(mergedNode?.mirrorOf, "a2a:am2");
  });
  it("materializes an offline placeholder source node for a source reporting offline:true even when ok:true", () => {
    const src = [{ source: "conductor" as const, ok: true, offline: true }];
    const snap = mergeSnapshot({ a2a: empty, conductor: empty }, src, {
      now: NOW,
    });
    const node = snap.nodes.find((n) => n.id === "source:conductor");
    assert.ok(node, "offline placeholder source:conductor node expected");
    assert.equal(node?.sublabel, "offline");
    assert.ok(
      snap.edges.some(
        (e) => e.from === "orchestrator" && e.to === "source:conductor" && e.kind === "owns"
      )
    );
  });
  it("failed source placeholder carries the typed sourceIssue union alongside sublabel", () => {
    const errSrc = [{ source: "conductor" as const, ok: false }];
    const errSnap = mergeSnapshot({ a2a: empty, conductor: empty }, errSrc, {
      now: NOW,
    });
    const errNode = errSnap.nodes.find((n) => n.id === "source:conductor");
    assert.equal(errNode?.sourceIssue, "error");
    assert.equal(errNode?.sublabel, "error");

    const offlineSrc = [{ source: "conductor" as const, ok: true, offline: true }];
    const offlineSnap = mergeSnapshot({ a2a: empty, conductor: empty }, offlineSrc, { now: NOW });
    const offlineNode = offlineSnap.nodes.find((n) => n.id === "source:conductor");
    assert.equal(offlineNode?.sourceIssue, "offline");
    assert.equal(offlineNode?.sublabel, "offline");
  });
  it("failed source placeholder carries staleSince from the SourceStatus (undefined when the status has none)", () => {
    const staleSince = "2026-09-01T12:00:00.000Z";
    const errSrc = [{ source: "conductor" as const, ok: false, staleSince }];
    const errSnap = mergeSnapshot({ a2a: empty, conductor: empty }, errSrc, {
      now: NOW,
    });
    const errNode = errSnap.nodes.find((n) => n.id === "source:conductor");
    assert.equal(errNode?.staleSince, staleSince);

    // buildSourceStatuses never sets staleSince for the offline case — mergeSnapshot must
    // not invent one, so the placeholder node's staleSince stays undefined.
    const offlineSrc = [{ source: "conductor" as const, ok: true, offline: true }];
    const offlineSnap = mergeSnapshot({ a2a: empty, conductor: empty }, offlineSrc, { now: NOW });
    const offlineNode = offlineSnap.nodes.find((n) => n.id === "source:conductor");
    assert.equal(offlineNode?.staleSince, undefined);
  });
  it("flags an EXISTING source node when its status starts failing (kept nodes, still stale)", () => {
    const staleSince = "2026-09-01T12:00:00.000Z";
    const a2aPart = fromA2A([a2aTask({ id: "live" })]);
    const originalSourceNode = a2aPart.nodes.find((n) => n.id === "source:a2a");
    assert.ok(originalSourceNode, "the mapper must already emit source:a2a");
    const src = [
      { source: "a2a" as const, ok: false, staleSince },
      { source: "conductor" as const, ok: true },
    ];
    const snap = mergeSnapshot({ a2a: a2aPart, conductor: empty }, src, { now: NOW });
    const merged = snap.nodes.find((n) => n.id === "source:a2a");
    assert.equal(merged?.sourceIssue, "error");
    assert.equal(merged?.staleSince, staleSince);
    assert.ok(
      snap.nodes.some((n) => n.id === "a2a:live"),
      "the source's work nodes must be kept, not replaced by a placeholder"
    );
    assert.equal(
      snap.nodes.filter((n) => n.id === "source:a2a").length,
      1,
      "no duplicate placeholder for a source that already had a node"
    );
    // Pure contract: the object handed in through `parts` must stay untouched.
    assert.equal("sourceIssue" in (originalSourceNode as object), false);
    assert.equal("staleSince" in (originalSourceNode as object), false);
  });
  it("flags an EXISTING source node as offline when its status reports offline:true", () => {
    const conductor = fromConductor(baseSnap);
    const src = [
      { source: "a2a" as const, ok: true },
      { source: "conductor" as const, ok: true, offline: true },
    ];
    const snap = mergeSnapshot({ a2a: empty, conductor }, src, { now: NOW });
    const merged = snap.nodes.find((n) => n.id === "source:conductor");
    assert.equal(merged?.sourceIssue, "offline");
    assert.equal(merged?.staleSince, undefined);
  });
  it("leaves a healthy source node free of sourceIssue/staleSince", () => {
    const a2aPart = fromA2A([a2aTask({ id: "ok1" })]);
    const snap = mergeSnapshot({ a2a: a2aPart, conductor: empty }, OK_SOURCES, {
      now: NOW,
    });
    const merged = snap.nodes.find((n) => n.id === "source:a2a");
    assert.ok(merged, "source:a2a expected");
    assert.equal(merged?.sourceIssue, undefined);
    assert.equal(merged?.staleSince, undefined);
  });
  it("overflow node carries droppedByState with the per-state counts of dropped work nodes", () => {
    const many = Array.from({ length: MAX_WORK_NODES + 5 }, (_, i) =>
      a2aTask({
        id: `ov${i}`,
        state: i < MAX_WORK_NODES ? "working" : "failed",
        updatedAt: new Date(NOW - i * 1000).toISOString(),
      })
    );
    const snap = mergeSnapshot({ a2a: fromA2A(many), conductor: empty }, OK_SOURCES, { now: NOW });
    const overflow = snap.nodes.find((n) => n.id === "overflow:a2a");
    assert.ok(overflow, "overflow node expected");
    assert.deepEqual(overflow?.droppedByState, { failed: 5 });
  });
  it("droppedByState is not a shared reference with counts — mutating counts after merge leaves it untouched", () => {
    const many = Array.from({ length: MAX_WORK_NODES + 5 }, (_, i) =>
      a2aTask({
        id: `dbs${i}`,
        state: i < MAX_WORK_NODES ? "working" : "failed",
        updatedAt: new Date(NOW - i * 1000).toISOString(),
      })
    );
    const snap = mergeSnapshot({ a2a: fromA2A(many), conductor: empty }, OK_SOURCES, { now: NOW });
    const overflow = snap.nodes.find((n) => n.id === "overflow:a2a");
    assert.ok(overflow, "overflow node expected");
    const before = { ...overflow?.droppedByState };
    if (overflow?.counts) overflow.counts.failed = 999;
    assert.deepEqual(overflow?.droppedByState, before, "droppedByState must not alias counts");
  });
  it("drops a stale terminal Conductor task older than STALE_COMPLETED_MS unless showCompleted", () => {
    const staleSnap: FleetSnapshot = {
      ...baseSnap,
      runners: [],
      tasks: [
        {
          ...baseSnap.tasks[0],
          id: "ctOld",
          status: "completed",
          runner: null,
          updated_at: new Date(NOW - STALE_COMPLETED_MS - 1000).toISOString(),
        },
      ],
    };
    const parts = { a2a: empty, conductor: fromConductor(staleSnap) };
    assert.ok(
      !mergeSnapshot(parts, OK_SOURCES, { now: NOW }).nodes.some(
        (n) => n.id === "conductor:task:ctOld"
      )
    );
    assert.ok(
      mergeSnapshot(parts, OK_SOURCES, { now: NOW, showCompleted: true }).nodes.some(
        (n) => n.id === "conductor:task:ctOld"
      )
    );
  });
});
