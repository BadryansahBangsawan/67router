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
  // plugins
  "src/lib/plugins",
  "src/lib/db/plugins.ts",
  "src/lib/db/pluginMetrics.ts",
  "src/lib/modelValidation/pluginFence.ts",
  "src/app/api/plugins",
  "src/app/(dashboard)/dashboard/plugins",
  "open-sse/handlers/chatCore/pluginRequestGate.ts",
  "open-sse/handlers/chatCore/pluginOnRequest.ts",
  "open-sse/handlers/chatCore/pluginOnResponse.ts",
  "open-sse/mcp-server/tools/pluginTools.ts",
  "bin/cli/commands/plugin.mjs",
  "bin/cli/plugins.mjs",
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
  // plugins
  /lib\/plugins\//,
  /db\/(plugins|pluginMetrics)\b/,
  /app\/api\/plugins\b/,
  /dashboard\/plugins\b/,
  /chatCore\/plugin(RequestGate|OnRequest|OnResponse)/,
  /\bpluginTools\b/,
  /\bOMNIROUTE_PLUGINS_DIR\b/,
  /cli\/plugins\.mjs|commands\/plugin\.mjs/,
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
