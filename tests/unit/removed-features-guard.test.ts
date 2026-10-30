import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Features permanently removed from 67router. Each entry is one line, grouped by feature,
// so a revert or an upstream merge that brings a feature back fails here first.
const REMOVED_PATHS: string[] = [
  // middleware hooks
  "src/lib/middleware/registry.ts",
  "src/lib/middleware/types.ts",
  "src/app/api/middleware",
  "src/lib/db/middleware.ts",
  // relay
  "src/app/api/relay",
  "src/app/api/v1/relay",
  "src/app/(dashboard)/dashboard/relay",
  "src/lib/db/relayProxies.ts",
  // batch + files
  "src/lib/batches",
  "open-sse/services/batchProcessor.ts",
  "src/app/api/v1/batches",
  "src/app/api/batches",
  "src/app/(dashboard)/dashboard/batch",
  "src/app/api/v1/files",
  "src/app/api/files",
  "src/lib/db/batches.ts",
  "src/lib/db/files.ts",
  "src/shared/constants/batch.ts",
  "src/shared/constants/batchEndpoints.ts",
  "bin/cli/commands/batches.mjs",
  "bin/cli/commands/files.mjs",
  // moderations
  "src/app/api/v1/moderations",
  "open-sse/handlers/moderations.ts",
  "bin/cli/api-commands/moderations.mjs",
  // free proxies
  "src/lib/freeProxyProviders",
  "src/app/api/settings/free-proxies",
  "src/app/api/settings/oneproxy",
  "src/lib/db/freeProxies.ts",
  "src/lib/db/oneproxy.ts",
  "src/app/(dashboard)/dashboard/settings/components/proxy/FreePoolTab.tsx",
  "bin/cli/commands/oneproxy.mjs",
  "src/app/(dashboard)/dashboard/system/1proxy",
  "src/shared/validation/freeProxySchemas.ts",
  // webhooks
  "src/lib/webhookDispatcher.ts",
  "src/lib/webhooks",
  "src/shared/network/webhookFetch.ts",
  "src/lib/db/webhooks.ts",
  "src/lib/db/webhookDeliveries.ts",
  "src/app/api/webhooks",
  "src/app/(dashboard)/dashboard/webhooks",
  "bin/cli/commands/webhooks.mjs",
  // memory
  "src/lib/memory",
  "src/app/api/memory",
  "src/app/api/settings/memory",
  "src/app/api/settings/qdrant",
  "src/app/(dashboard)/dashboard/memory",
  "src/app/(dashboard)/dashboard/settings/components/MemorySkillsTab.tsx",
  "src/shared/schemas/memory.ts",
  "src/shared/schemas/qdrant.ts",
  "src/lib/db/memoryVec.ts",
  "src/lib/skills/memoryBuiltins.ts",
  "open-sse/mcp-server/tools/memoryTools.ts",
  "open-sse/handlers/chatCore/memoryExtraction.ts",
  "open-sse/handlers/chatCore/memorySkillsInjection.ts",
  "bin/cli/commands/memory.mjs",
  "bin/cli/api-commands/memory.mjs",
  // skills framework (the chat tool-loop core and builtin web_search/web_fetch stay)
  "src/lib/skills/registry.ts",
  "src/lib/skills/executor.ts",
  "src/lib/skills/injection.ts",
  "src/lib/skills/githubCollector.ts",
  "src/lib/skills/skillssh.ts",
  "src/lib/skills/providerSettings.ts",
  "src/lib/skills/sandbox.ts",
  "src/lib/skills/containerProvider.ts",
  "src/lib/skills/schemas.ts",
  "src/lib/skills/types.ts",
  "src/lib/skills/builtin",
  "src/lib/skills/__tests__",
  "src/lib/db/skills.ts",
  "src/app/api/skills/route.ts",
  "src/app/api/skills/[id]",
  "src/app/api/skills/executions",
  "src/app/api/skills/install",
  "src/app/api/skills/marketplace",
  "src/app/api/skills/skillssh",
  "src/app/api/skills/collect/detect",
  "src/app/api/skills/collect/install",
  "src/app/api/github-skills",
  "src/app/(dashboard)/dashboard/omni-skills",
  "open-sse/mcp-server/tools/skillTools.ts",
  "open-sse/mcp-server/tools/githubSkillTools.ts",
  "bin/cli/commands/skills.mjs",
];

const FORBIDDEN_IMPORTS: RegExp[] = [
  // middleware hooks
  /lib\/middleware\/(registry|types)/,
  /api\/middleware\/hooks/,
  /\binitPreRequestRegistry\b|\brunHooks\b/,
  // relay
  /db\/relayProxies/,
  /app\/api\/relay\/|api\/v1\/relay\//,
  /dashboard\/relay/,
  // batch + files
  /lib\/batches\//,
  /batchProcessor/,
  /db\/(batches|files)\b/,
  /constants\/(batch|batchEndpoints)\b/,
  /api\/v1\/(batches|files)/,
  /\binitBatchProcessor\b/,
  // moderations
  /handlers\/moderations/,
  /api\/v1\/moderations/,
  // free proxies
  /freeProxyProviders/,
  /db\/(freeProxies|oneproxy)\b/,
  /settings\/(free-proxies|oneproxy)/,
  /omniroute_oneproxy_/,
  /FreePoolTab/,
  /validation\/freeProxySchemas/,
  /\bfreeProxy(Source|List|Sync|BulkAdd)Schema\b/,
  // webhooks
  /webhookDispatcher/,
  /lib\/webhooks\//,
  /db\/webhook(s|Deliveries)\b/,
  /api\/webhooks/,
  /dashboard\/webhooks/,
  /\bparseAndValidateWebhookUrl\b/,
  // memory
  /lib\/memory\//,
  /api\/memory\b|api\/settings\/(memory|qdrant)\b/,
  /dashboard\/memory\b/,
  /schemas\/memory\b/,
  /db\/memoryVec\b/,
  /\bmemoryTools\b|omniroute_memory_/,
  /memoryBuiltins|memorySkillsInjection|chatCore\/memoryExtraction/,
  /\b(injectMemory|retrieveMemories|extractFacts|runMemoryExtractionGate)\b/,
  // skills framework
  /lib\/skills\/(registry|executor|injection|githubCollector|skillssh|providerSettings|sandbox|containerProvider|schemas|types|builtin\/)\b/,
  /db\/skills\b/,
  /app\/api\/skills\/(executions|install|marketplace|skillssh|\[id\])|app\/api\/github-skills/,
  /dashboard\/omni-skills/,
  /\b(skillTools|githubSkillTools)\b|omniroute_(skills|github_skills)_/,
  /\b(skillRegistry|skillExecutor|registerBuiltinSkills)\b/,
];

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCAN_DIRS = ["src", "open-sse", "bin"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"]);

function collectSourceFiles(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, out);
    else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const sourceFiles = SCAN_DIRS.flatMap((dir) => collectSourceFiles(path.join(ROOT, dir), []));

test("guard scan covers the source tree", () => {
  assert.ok(sourceFiles.length >= 1000, `only ${sourceFiles.length} source files scanned`);
});

for (const removed of REMOVED_PATHS) {
  test(`removed: ${removed}`, () => {
    assert.equal(fs.existsSync(path.join(ROOT, removed)), false, `${removed} still exists`);
  });
}

for (const pattern of FORBIDDEN_IMPORTS) {
  test(`no source file matches ${pattern}`, () => {
    const offenders = sourceFiles
      .filter((file) => pattern.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));
    assert.deepEqual(offenders, [], `still referenced in:\n${offenders.join("\n")}`);
  });
}
