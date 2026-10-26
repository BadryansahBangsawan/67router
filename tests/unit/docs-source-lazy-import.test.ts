import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// `@/lib/source` pulls every compiled docs page (~44 MB of heap). Next preloads
// every route entry at server start, so a static import from any docs route
// keeps the whole docs site resident even when /docs is never opened. Docs
// routes must load it with a dynamic import() instead ([...slug]/page.tsx
// already does).
const DOCS_ENTRIES = [
  "src/app/docs/layout.tsx",
  "src/app/docs/page.tsx",
  "src/app/docs/[...slug]/page.tsx",
  "src/app/docs/api/search/route.ts",
];

for (const file of DOCS_ENTRIES) {
  test(`${file} does not statically import the docs source`, () => {
    const code = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(
      code,
      /^import\s[^;]*from\s+["'](@\/lib\/source|(\.\.\/)+lib\/source)["']/m,
      "load @/lib/source with await import() inside the handler"
    );
  });
}
