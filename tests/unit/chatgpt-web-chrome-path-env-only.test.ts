/**
 * The browser binary the ChatGPT Web providers launch comes from the environment only
 * (CHATGPT_WEB_CODEX_CHROME_PATH / CHATGPT_WEB_CHROME_PATH / CHROME_PATH, then well-known
 * install paths). A `chromeExecutablePath` stored in a connection's providerSpecificData is
 * writable through the provider management API and must never pick the executable.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { detectChromeExecutable } from "../../open-sse/executors/chatgpt-web-codex.ts";
import {
  executeChatGptWebCleanRoom,
  resolveChatGptWebChromeExecutable,
} from "../../open-sse/utils/chatgptWebExecutorAdapter.ts";
import type { ChatGptWebBrowserSession } from "../../open-sse/utils/chatgptWebBrowserSession.ts";

// Any file that exists on every host: stands in for an arbitrary executable on disk.
const ARBITRARY_EXECUTABLE = process.execPath;
const ENV_KEYS = ["CHATGPT_WEB_CODEX_CHROME_PATH", "CHATGPT_WEB_CHROME_PATH", "CHROME_PATH"];

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("chatgpt-web-codex ignores a caller-supplied browser path", () => {
  const detect = detectChromeExecutable as (explicit?: string) => string | undefined;
  withEnv({}, () => {
    assert.notEqual(detect(ARBITRARY_EXECUTABLE), ARBITRARY_EXECUTABLE);
  });
});

test("chatgpt-web-codex honors the environment variable", () => {
  withEnv({ CHATGPT_WEB_CODEX_CHROME_PATH: ARBITRARY_EXECUTABLE }, () => {
    assert.equal(detectChromeExecutable(), ARBITRARY_EXECUTABLE);
  });
});

test("chatgpt-web resolves the browser from the environment", () => {
  const resolved = resolveChatGptWebChromeExecutable({
    env: { CHATGPT_WEB_CHROME_PATH: "/env/chrome" },
    exists: (candidate) => candidate === "/env/chrome",
  });
  assert.equal(resolved, "/env/chrome");
});

test("chatgpt-web clean-room session ignores providerSpecificData.chromeExecutablePath", async () => {
  const session = {
    url: () => "https://chatgpt.com/?temporary-chat=true",
    start: async () => async () => {},
    submitPrompt: async () => "",
  } satisfies ChatGptWebBrowserSession;
  let observed: Record<string, unknown> | null = null;

  const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  try {
    await executeChatGptWebCleanRoom(
      {
        model: "gpt-5-6-pro",
        body: { messages: [{ role: "user", content: "hello" }] },
        stream: false,
        credentials: {
          connectionId: "connection",
          providerSpecificData: {
            storageState: { cookies: [], origins: [] },
            chromeExecutablePath: ARBITRARY_EXECUTABLE,
          },
        },
      },
      {
        createSession: async (input) => {
          observed = input;
          return session;
        },
        runTurn: async () => ({ text: "answer" }) as never,
        id: () => "chatcmpl-env-only",
        now: () => 123_000,
      }
    );
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.ok(observed, "session factory was called");
  assert.notEqual(observed.chromeExecutablePath, ARBITRARY_EXECUTABLE);
});
