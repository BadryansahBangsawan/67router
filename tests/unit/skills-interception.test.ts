import test from "node:test";
import assert from "node:assert/strict";

// Server-side tool interception after the Skills framework removal: only the builtin
// web_search / web_fetch handlers (the web fallbacks) are executed by the gateway.
const { builtinSkills } = await import("../../src/lib/skills/builtins.ts");
const { interceptToolCalls, extractToolCalls, handleToolCallExecution, buildWebSearchCallItem } =
  await import("../../src/lib/skills/interception.ts");
const { OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME } =
  await import("../../open-sse/services/webSearchFallback.ts");

type BuiltinHandler = (
  input: Record<string, unknown>,
  context: Record<string, unknown>
) => Promise<Record<string, unknown>>;
const mutableBuiltins = builtinSkills as unknown as Record<string, BuiltinHandler>;
const originalWebFetch = mutableBuiltins.web_fetch;

const executionContext = {
  apiKeyId: "key-a",
  sessionId: "session-1",
  requestId: "request-1",
  builtinToolNames: ["web_fetch"],
};

test.beforeEach(() => {
  mutableBuiltins.web_fetch = async (input) => ({ success: true, url: String(input.url ?? "") });
});

test.after(() => {
  mutableBuiltins.web_fetch = originalWebFetch;
});

test("buildWebSearchCallItem emits a native web_search_call item only for successful web-search fallback results", () => {
  const call = { id: "call_search", name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME, arguments: {} };
  const item = buildWebSearchCallItem(call, {
    success: true,
    provider: "serper-search",
    query: "latest omniroute release",
    results: [
      {
        title: "OmniRoute Docs",
        url: "https://example.com/omniroute",
        display_url: "example.com/omniroute",
        snippet: "The OmniRoute documentation",
      },
      { url: "https://example.com/no-title" },
      { title: "No URL", url: "" },
    ],
  });

  assert.equal(item?.type, "web_search_call");
  assert.equal(item?.status, "completed");
  assert.equal((item?.action as Record<string, unknown>).type, "web_search");
  assert.equal((item?.action as Record<string, unknown>).query, "latest omniroute release");
  const sources = (item?.action as Record<string, unknown>).sources as Array<
    Record<string, string>
  >;
  assert.deepEqual(sources, [
    {
      title: "OmniRoute Docs",
      url: "https://example.com/omniroute",
      caption: "The OmniRoute documentation",
    },
    { title: "https://example.com/no-title", url: "https://example.com/no-title", caption: "" },
  ]);

  // Non-search fallback calls never produce a web_search_call item.
  assert.equal(
    buildWebSearchCallItem(
      { id: "call-1", name: "lookup@1.0.0", arguments: {} },
      { success: true }
    ),
    null
  );
  // Failed searches keep the existing function_call_output error only.
  assert.equal(buildWebSearchCallItem(call, { success: false, error: "quota" }), null);
  assert.equal(buildWebSearchCallItem(call, null), null);
});

test("extractToolCalls supports OpenAI, Anthropic and Gemini shapes", () => {
  const openaiRoot = extractToolCalls(
    {
      tool_calls: [
        {
          id: "call-root",
          function: { name: "lookup@1.0.0", arguments: '{"id":"123"}' },
        },
      ],
    },
    "gpt-4.1"
  );
  const openaiChoices = extractToolCalls(
    {
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call-choice",
                function: { name: "lookup@1.0.0", arguments: "not-json" },
              },
            ],
          },
        },
      ],
    },
    "openai-compatible-model"
  );
  const anthropic = extractToolCalls(
    {
      content: [
        { type: "text", text: "ignored" },
        { type: "tool_use", id: "claude-1", name: "lookup@1.0.0", input: { id: "abc" } },
      ],
    },
    "claude-sonnet"
  );
  const gemini = extractToolCalls(
    {
      functionCalls: [{ name: "lookup@1.0.0", args: { id: "gemini" } }],
    },
    "gemini-2.5-pro"
  );
  const responses = extractToolCalls(
    {
      object: "response",
      output: [
        {
          type: "function_call",
          call_id: "call-response",
          name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
          arguments: '{"query":"latest omniroute"}',
        },
      ],
    },
    "openai"
  );

  assert.deepEqual(openaiRoot, [
    {
      id: "call-root",
      name: "lookup@1.0.0",
      arguments: { id: "123" },
    },
  ]);
  assert.deepEqual(openaiChoices, [
    {
      id: "call-choice",
      name: "lookup@1.0.0",
      arguments: {},
    },
  ]);
  assert.deepEqual(anthropic, [
    {
      id: "claude-1",
      name: "lookup@1.0.0",
      arguments: { id: "abc" },
    },
  ]);
  assert.equal(gemini.length, 1);
  assert.equal(gemini[0].name, "lookup@1.0.0");
  assert.deepEqual(gemini[0].arguments, { id: "gemini" });
  assert.deepEqual(responses, [
    {
      id: "call-response",
      name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
      arguments: { query: "latest omniroute" },
    },
  ]);
  assert.deepEqual(extractToolCalls({}, "custom-model"), []);
});

test("interceptToolCalls returns builtin outputs, sanitized errors and no-handler errors", async () => {
  mutableBuiltins.web_fetch = async (input) => {
    if (input.url === "boom") throw new Error("fetch failure");
    return { success: true, url: String(input.url) };
  };
  const results = await interceptToolCalls(
    [
      { id: "ok-call", name: "web_fetch", arguments: { url: "https://a.example" } },
      { id: "error-call", name: "web_fetch", arguments: { url: "boom" } },
      { id: "missing-call", name: "lookup@1.0.0", arguments: {} },
    ],
    executionContext
  );

  assert.deepEqual(results, [
    { id: "ok-call", result: { success: true, url: "https://a.example" } },
    { id: "error-call", result: { error: "fetch failure" } },
    { id: "missing-call", result: { error: "No handler for tool" } },
  ]);
});

test("builtin errors are sanitized before OpenAI tool-result response shapes", async () => {
  const hostileMessage =
    "fetch failure access_token=skill-public-secret at /srv/private/skill-handler.ts\n" +
    "    at execute (/srv/private/skill-handler.ts:17:4)";
  mutableBuiltins.web_fetch = async () => {
    throw new Error(hostileMessage);
  };

  const chatResult = await handleToolCallExecution(
    {
      choices: [
        {
          message: {
            tool_calls: [{ id: "chat-error", function: { name: "web_fetch", arguments: "{}" } }],
          },
        },
      ],
    },
    "gpt-4o-mini",
    executionContext
  );
  const responsesResult = await handleToolCallExecution(
    {
      object: "response",
      output: [
        { type: "function_call", call_id: "responses-error", name: "web_fetch", arguments: "{}" },
      ],
    },
    "openai",
    executionContext
  );
  const serialized = JSON.stringify({ chatResult, responsesResult });

  assert.match(serialized, /fetch failure/i);
  assert.doesNotMatch(
    serialized,
    /skill-public-secret|srv\/private|skill-handler\.ts|\bat execute\b/i
  );
});

test("failed builtin outputs are sanitized before public tool results", async () => {
  const hostile =
    "builtin failed access_token=builtin-output-secret at /srv/private/builtin-output.ts\n" +
    "    at run (/srv/private/builtin-output.ts:9:4)";
  mutableBuiltins.web_fetch = async () => ({
    success: false,
    status: 502,
    headers: { authorization: "Bearer builtin-output-secret" },
    body: hostile,
  });
  const results = await interceptToolCalls(
    [{ id: "builtin-failure", name: "web_fetch", arguments: { url: "https://example.com" } }],
    executionContext
  );
  const serialized = JSON.stringify(results);

  assert.equal((results[0]?.result as Record<string, unknown>)?.status, 502);
  assert.doesNotMatch(
    serialized,
    /builtin-output-secret|srv\/private|builtin-output\.ts|\bat run\b/i
  );
});

test("handleToolCallExecution appends OpenAI tool results and leaves empty responses untouched", async () => {
  const openaiResponse = await handleToolCallExecution(
    {
      choices: [
        {
          message: {
            tool_calls: [
              { id: "call-1", function: { name: "web_fetch", arguments: '{"url":"u99"}' } },
            ],
          },
        },
      ],
    },
    "gpt-4o-mini",
    executionContext
  );

  assert.deepEqual(openaiResponse.tool_results, [
    { tool_call_id: "call-1", output: '{"success":true,"url":"u99"}' },
  ]);

  const untouched = { choices: [{ message: { content: "plain text" } }] };
  assert.equal(await handleToolCallExecution(untouched, "gpt-4.1", executionContext), untouched);
});

test("handleToolCallExecution returns Anthropic builtin results as text", async () => {
  const anthropicResponse = await handleToolCallExecution(
    {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tool-1", name: "web_fetch", input: { url: "u77" } }],
    },
    "claude-3-7-sonnet",
    executionContext
  );

  assert.deepEqual(anthropicResponse.content, [
    { type: "text", text: '[Skill result: web_fetch]\n{"success":true,"url":"u77"}' },
  ]);
  assert.equal(
    anthropicResponse.content.some((b: { type: string }) => b.type === "tool_result"),
    false
  );
  assert.equal(anthropicResponse.stop_reason, "end_turn");
  assert.equal(anthropicResponse.stop_sequence, null);
});

test("handleToolCallExecution appends Responses API function_call_output items", async () => {
  const responsesResult = await handleToolCallExecution(
    {
      object: "response",
      output: [
        {
          type: "function_call",
          call_id: "call-response",
          name: "web_fetch",
          arguments: '{"url":"u55"}',
        },
      ],
    },
    "openai",
    executionContext
  );

  assert.deepEqual(responsesResult.output, [
    {
      type: "function_call",
      call_id: "call-response",
      name: "web_fetch",
      arguments: '{"url":"u55"}',
    },
    {
      type: "function_call_output",
      call_id: "call-response",
      output: '{"success":true,"url":"u55"}',
    },
  ]);
});

test("handleToolCallExecution forwards client-native tool_use untouched (#2815)", async () => {
  const original = {
    content: [
      { type: "tool_use", id: "tool-native", name: "Bash", input: { command: "ls" } },
      { type: "text", text: "Calling Bash" },
    ],
  };
  const result = await handleToolCallExecution(original, "claude-3-7-sonnet", executionContext);

  assert.equal(result, original);
});

test("handleToolCallExecution intercepts a builtin alongside a client-native tool (#2815)", async () => {
  const mixed = await handleToolCallExecution(
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "tool-native", name: "Bash", input: { command: "ls" } },
        { type: "tool_use", id: "tool-builtin", name: "web_fetch", input: { url: "u9" } },
      ],
    },
    "claude-3-7-sonnet",
    executionContext
  );

  assert.deepEqual(mixed.content, [
    { type: "text", text: '[Skill result: web_fetch]\n{"success":true,"url":"u9"}' },
    { type: "tool_use", id: "tool-native", name: "Bash", input: { command: "ls" } },
  ]);
  assert.equal(mixed.stop_reason, "tool_use");
});

test("former custom-skill and memory tool names are never executed server-side", async () => {
  const original = {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: "t1", name: "lookup@1.0.0", input: {} },
      { type: "tool_use", id: "t2", name: "memory_search", input: { query: "x" } },
    ],
  };
  const result = await handleToolCallExecution(original, "claude-3-7-sonnet", {
    ...executionContext,
    builtinToolNames: ["web_fetch", "memory_search"],
    injectedCustomSkillNames: ["lookup@1.0.0"],
    customSkillExecutionEnabled: true,
  });

  assert.equal(result, original);
});

test("a builtin is only executed when it is in the request's owner set", async () => {
  const original = {
    content: [{ type: "tool_use", id: "t1", name: "web_fetch", input: { url: "u" } }],
  };
  const result = await handleToolCallExecution(original, "claude-3-7-sonnet", {
    ...executionContext,
    builtinToolNames: [],
  });
  assert.equal(result, original);
});
