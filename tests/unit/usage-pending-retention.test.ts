import test from "node:test";
import assert from "node:assert/strict";

const {
  trackPendingRequest,
  getPendingById,
  sweepStalePendingRequests,
  getPendingRetainedBytes,
  updatePendingRequestStreamChunks,
  clearPendingRequests,
} = await import("../../src/lib/usage/usageHistory.ts");

const HOUR_MS = 60 * 60 * 1000;
const BIG_CHUNK = "x".repeat(100_000);

test("stream chunks attached after insert are counted and released exactly once", () => {
  clearPendingRequests();
  const id = trackPendingRequest("m", "p", "conn", true, {});
  const afterInsert = getPendingRetainedBytes();

  updatePendingRequestStreamChunks("m", "p", "conn", { provider: [BIG_CHUNK] });
  assert.ok(
    getPendingRetainedBytes() >= afterInsert + BIG_CHUNK.length,
    "attached stream chunks must count against the byte ceiling"
  );

  trackPendingRequest("m", "p", "conn", false, undefined, id);
  assert.equal(getPendingById().size, 0);
  assert.equal(getPendingRetainedBytes(), 0, "removal must not drift the counter below zero");
});

test("sweep re-measures stream chunks that grew in place after being attached", () => {
  clearPendingRequests();
  const id = trackPendingRequest("m", "p", "conn", true, {});
  const chunks = { provider: [] as string[] };
  // requestLogger attaches its live arrays once and keeps appending to them.
  getPendingById().get(id).streamChunks = chunks;
  chunks.provider.push(BIG_CHUNK, BIG_CHUNK);

  sweepStalePendingRequests(Date.now());
  assert.ok(
    getPendingRetainedBytes() >= 2 * BIG_CHUNK.length,
    `retained bytes must include grown chunks (got ${getPendingRetainedBytes()})`
  );

  trackPendingRequest("m", "p", "conn", false, undefined, id);
  assert.equal(getPendingRetainedBytes(), 0);
});

test("stale entries keep their dashboard row but release their payloads", () => {
  clearPendingRequests();
  const id = trackPendingRequest("m", "p", "conn", true, {
    clientRequest: { messages: [{ role: "user", content: "hello" }] },
  });
  updatePendingRequestStreamChunks("m", "p", "conn", { provider: [BIG_CHUNK] });

  sweepStalePendingRequests(Date.now() + 2 * HOUR_MS, HOUR_MS);

  const detail = getPendingById().get(id);
  assert.ok(detail, "a stuck request stays visible on the dashboard");
  assert.equal(detail.stale, true);
  assert.equal(detail.clientRequest, undefined, "request payload is released");
  assert.equal(detail.streamChunks, undefined, "stream chunks are released");
  assert.ok(getPendingRetainedBytes() < 1024, "only the scalar row remains accounted");

  clearPendingRequests();
});
