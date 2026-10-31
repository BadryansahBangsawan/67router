import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-kie-contract-14335-"));
process.env.DATA_DIR = dataDir;
process.env.OMNIROUTE_PLUGINS_DIR = path.join(dataDir, "plugins");
assert.equal(process.env.DATA_DIR, dataDir);

const { KIE_IMAGE_MODELS } =
  await import("../../open-sse/config/providers/registry/kie/imageModels.ts");

test("Flux Kontext Pro and Max are explicit dedicated-API catalog entries", () => {
  const models = KIE_IMAGE_MODELS as Array<{
    id: string;
    name: string;
    isMarket?: boolean;
    kieFluxKontextModel?: string;
  }>;
  assert.equal(models.find((entry) => entry.id === "flux/kontext")?.isMarket, false);
  assert.equal(
    models.find((entry) => entry.id === "flux/kontext")?.kieFluxKontextModel,
    "flux-kontext-pro"
  );
  assert.equal(
    models.find((entry) => entry.id === "flux/kontext-max")?.kieFluxKontextModel,
    "flux-kontext-max"
  );
});

test("legacy Z-Image aliases are not advertised as undocumented upstream versions", () => {
  for (const entry of KIE_IMAGE_MODELS.filter((model) => model.id.startsWith("z-image/"))) {
    assert.match(entry.name, /alias/i);
    assert.doesNotMatch(entry.name, /v4\.[05]/i);
  }
});
