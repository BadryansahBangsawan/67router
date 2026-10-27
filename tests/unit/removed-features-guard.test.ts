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
