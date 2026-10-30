import test from "node:test";
import assert from "node:assert/strict";

const { updateSettingsSchema } = await import("../../src/shared/validation/settingsSchemas.ts");
const { HIDEABLE_SIDEBAR_ITEM_IDS, SIDEBAR_SECTIONS } =
  await import("../../src/shared/constants/sidebarVisibility.ts");
const { HIDEABLE_SIDEBAR_GROUP_IDS } =
  await import("../../src/shared/constants/sidebarGroupVisibility.ts");

// Saved settings can still name sidebar entries for features that were removed
// (webhooks, batch, ...). Saving them again must drop the stale ids, not reject the request.
test("unknown sidebar ids are dropped instead of failing validation", () => {
  const realItem = HIDEABLE_SIDEBAR_ITEM_IDS[0];
  const realSection = SIDEBAR_SECTIONS[0].id;
  const realGroup = HIDEABLE_SIDEBAR_GROUP_IDS[0];

  const result = updateSettingsSchema.safeParse({
    hiddenSidebarItems: ["home-not-a-real-id", realItem],
    hiddenSidebarSections: ["gone-section", realSection],
    hiddenSidebarGroupLabels: ["gone-group", realGroup],
    sidebarSectionOrder: ["not-a-section"],
  });

  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  assert.deepEqual(result.data.hiddenSidebarItems, [realItem]);
  assert.deepEqual(result.data.hiddenSidebarSections, [realSection]);
  assert.deepEqual(result.data.hiddenSidebarGroupLabels, [realGroup]);
  assert.deepEqual(result.data.sidebarSectionOrder, []);
});

test("omitted sidebar fields stay undefined", () => {
  const result = updateSettingsSchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.hiddenSidebarItems, undefined);
  assert.equal(result.data.sidebarSectionOrder, undefined);
});
