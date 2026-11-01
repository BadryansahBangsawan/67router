/**
 * #17188 — drive both real callers through their HTTP fetch seams.
 * The request must select the combo as `model`; x-combo is not a gateway input.
 * No live upstream credentials or provider are required.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// Keep MCP audit attempts away from a real user database in standalone runs.
import "../_setup/isolateDataDir.ts";

const { closeAuditDb } = await import("../../open-sse/mcp-server/audit.ts");
const { handleRouteRequest } = await import("../../open-sse/mcp-server/tools/inferenceTools.ts");

test.after(() => closeAuditDb());

const messages = [{ role: "user", content: "hello" }];
const completion = {
  choices: [{ message: { content: "response" } }],
  model: "anthropic/claude-sonnet",
  provider: "claude",
  usage: { prompt_tokens: 12, completion_tokens: 7 },
  cost: 0.001,
};

type CapturedCall = {
  url: string;
  method: string | undefined;
  body: Record<string, unknown>;
};

async function withCapturedFetch<T>(
  action: () => Promise<T>,
  responseBody: Record<string, unknown> = completion
): Promise<{ value: T; calls: CapturedCall[] }> {
  const original = globalThis.fetch;
  const calls: CapturedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  try {
    return { value: await action(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

test("#17188 MCP route_request dispatches requested combo as model", async () => {
  const { value, calls } = await withCapturedFetch(() =>
    handleRouteRequest({ model: "openai/gpt-6", messages, combo: "Coding Team [1m]" })
  );
  assert.notEqual("isError" in value && value.isError, true, JSON.stringify(value));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/chat\/completions$/);
  assert.equal(calls[0].body.model, "Coding Team [1m]");
  assert.equal(calls[0].body["x-combo"], undefined);
  assert.equal(calls[0].body.stream, false);
});

test("#17188 MCP without combo preserves the selected model", async () => {
  const { value, calls } = await withCapturedFetch(() =>
    handleRouteRequest({ model: "openai/gpt-6", messages })
  );
  assert.notEqual("isError" in value && value.isError, true, JSON.stringify(value));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "openai/gpt-6");
  assert.equal(calls[0].body["x-combo"], undefined);
});

test("#17188 MCP rejects invalid combo without contacting the gateway", async () => {
  const { value, calls } = await withCapturedFetch(() =>
    handleRouteRequest({ model: "openai/gpt-6", messages, combo: "   " })
  );
  assert.equal("isError" in value && value.isError, true);
  assert.equal(calls.length, 0);
});
