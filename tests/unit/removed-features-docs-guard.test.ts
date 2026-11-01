import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Companion to removed-features-guard.test.ts. That guard scans source code; this one scans the
// agent-facing and public text surfaces (llm.txt, README, skills, docs, the served OpenAPI copy),
// which agents and users read as a description of what 67router can do. A removed feature that is
// still advertised there sends agents to endpoints that answer 404.

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function offendingLines(text: string, pattern: RegExp): string[] {
  return text
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, index }) => `${index + 1}: ${line.trim().slice(0, 160)}`);
}

function assertNoMatch(rel: string, text: string, pattern: RegExp) {
  const hits = offendingLines(text, pattern);
  assert.deepEqual(
    hits,
    [],
    `${rel} still advertises a removed feature (${pattern}):\n${hits.join("\n")}`
  );
}

// ── llm.txt (root + docs/i18n/*/llm.txt mirrors) ─────────────────────────────

const LLM_TXT_PATTERNS: RegExp[] = [
  /Memory\/Skills systems/,
  /imageGeneration\.ts|audioSpeech\.ts/,
  /Image\/video\/music generation/,
  /#\s+images, audio,/,
  /\*\*Webhooks\*\*/,
  /# Image format translation/,
];

const llmFiles = [
  "llm.txt",
  ...fs
    .readdirSync(path.join(ROOT, "docs/i18n"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `docs/i18n/${entry.name}/llm.txt`)
    .filter((rel) => fs.existsSync(path.join(ROOT, rel))),
];

test("llm.txt mirrors are scanned", () => {
  assert.ok(llmFiles.length > 1, "expected the docs/i18n llm.txt mirrors");
});

for (const pattern of LLM_TXT_PATTERNS) {
  test(`llm.txt and its mirrors do not match ${pattern}`, () => {
    for (const rel of llmFiles) assertNoMatch(rel, read(rel), pattern);
  });
}

test("llm.txt lists only handlers that exist in open-sse/handlers", () => {
  const handlerBlock = read("llm.txt").split("├── handlers/")[1]?.split("├── mcp-server/")[0] ?? "";
  const handlerFiles = [...handlerBlock.matchAll(/[├└]── (\w+\.ts)/g)].map((m) => m[1]);
  assert.ok(handlerFiles.length > 0, "handler tree not found in llm.txt");
  const missing = handlerFiles.filter(
    (file) => !fs.existsSync(path.join(ROOT, "open-sse/handlers", file))
  );
  assert.deepEqual(
    missing,
    [],
    `llm.txt lists handlers that no longer exist: ${missing.join(", ")}`
  );
});
