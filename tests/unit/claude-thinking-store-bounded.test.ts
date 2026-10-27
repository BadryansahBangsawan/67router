import test from "node:test";
import assert from "node:assert/strict";

const store = await import("../../open-sse/services/claudeThinkingStore.ts");

// Each stored turn is thinking text a client never sends back, held for up to an
// hour. The whole store must stay within 32M chars (~32-64 MB of heap).
test("claude thinking store evicts oldest turns beyond 32M chars", () => {
  store.clearClaudeThinkingStore();
  const turnChars = 1_900_000;
  const thinking = "t".repeat(turnChars - 10);
  for (let i = 0; i < 20; i++) {
    assert.equal(
      store.storeClaudeThinkingBlocks({
        toolUseIds: [`toolu_${i}`],
        blocks: [{ type: "thinking", thinking, signature: "sig_value1" }],
        provider: "claude",
        model: "claude-sonnet-4-5",
      }),
      true
    );
  }

  const kept = store.getClaudeThinkingStoreSizeForTests();
  assert.ok(kept <= Math.floor((32 * 1024 * 1024) / turnChars), `kept ${kept} turns`);
  assert.ok(
    store.restoreClaudeThinkingBlocks({
      toolUseIds: ["toolu_19"],
      provider: "claude",
      model: "claude-sonnet-4-5",
    }),
    "the newest turn survives"
  );
  store.clearClaudeThinkingStore();
});
