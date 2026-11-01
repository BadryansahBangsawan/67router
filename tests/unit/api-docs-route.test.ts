import test from "node:test";
import assert from "node:assert/strict";

// GET /api/docs serves the Redoc-rendered API reference (#4781). Static HTML
// shell that loads Redoc from a CDN and points it at /openapi.yaml (the
// canonical spec served from public/openapi.yaml). PUBLIC tier — no auth.
const docsRoute = await import("../../src/app/api/docs/route.ts");

test("GET /api/docs returns a 200 text/html Redoc shell", async () => {
  const response = docsRoute.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);

  const body = await response.text();
  // Renders Redoc and points it at the canonical spec.
  assert.match(body, /redoc/i);
  assert.ok(body.includes("/openapi.yaml"), "Redoc must load the canonical /openapi.yaml spec");
  // No stack traces / secrets leaked into the static shell.
  assert.ok(!body.includes("at /"), "static shell must not leak stack-trace frames");
});

test("GET /api/docs is statically renderable (no per-request work)", () => {
  assert.equal(docsRoute.dynamic, "force-static");
});

// The Redoc shell loads /openapi.yaml, which Next serves from public/openapi.yaml. That copy
// fell behind docs/openapi.yaml (v3.8.35, still documenting /api/memory, /v1/embeddings,
// /v1/images/generations…), and the OpenAPI gates only read docs/openapi.yaml.
test("public/openapi.yaml (served at /openapi.yaml) is the canonical docs/openapi.yaml", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(import.meta.dirname, "../..");
  const served = fs.readFileSync(path.join(root, "public/openapi.yaml"), "utf8");
  const canonical = fs.readFileSync(path.join(root, "docs/openapi.yaml"), "utf8");
  assert.ok(
    served === canonical,
    "public/openapi.yaml differs from docs/openapi.yaml — copy it over"
  );
});
