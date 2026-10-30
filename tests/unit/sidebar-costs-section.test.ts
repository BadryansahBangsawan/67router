import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

function findSection(id: string) {
  return sidebarVisibility.SIDEBAR_SECTIONS.find((s) => s.id === id);
}

// Sidebar v2 (67router): the Costs section folded into Observe — the "costs" overview is a flat
// Observe row and the rest is Observe's "Costs" sub-group (costs-more). This cluster stands in
// for the old section so the item-level contracts below stay checked.
function costsCluster() {
  const observe = findSection("observe");
  assert.ok(observe, "observe section must exist");
  const costsItem = observe.children.find((c) => !("type" in c) && c.id === "costs");
  const group = observe.children.find((c) => "type" in c && c.id === "costs-more");
  assert.ok(costsItem && group, "observe holds the costs row and the costs-more group");
  return {
    id: "costs",
    titleKey: "costsSection",
    titleFallback: "Costs",
    children: [costsItem, group],
  };
}

test("costs cluster exists in the Observe section", () => {
  assert.ok(costsCluster().children.length === 2);
});

test("costs section has exactly 6 items in the correct order", () => {
  const section = costsCluster();

  const items = sidebarVisibility.getSectionItems(section);
  assert.equal(items.length, 6, "costs section must have 6 items");

  const itemIds = items.map((i) => i.id);
  assert.deepEqual(itemIds, [
    "costs",
    "costs-pricing",
    "costs-budget",
    "costs-free-tiers",
    "free-provider-rankings",
    "radar",
  ]);
});

test("costs section items have correct hrefs", () => {
  const section = costsCluster();

  const items = sidebarVisibility.getSectionItems(section);
  const hrefs = items.map((i) => ({ id: i.id, href: i.href }));

  assert.deepEqual(hrefs, [
    { id: "costs", href: "/dashboard/costs" },
    { id: "costs-pricing", href: "/dashboard/costs/pricing" },
    { id: "costs-budget", href: "/dashboard/costs/budget" },
    { id: "costs-free-tiers", href: "/dashboard/free-tiers" },
    { id: "free-provider-rankings", href: "/dashboard/free-provider-rankings" },
    { id: "radar", href: "/dashboard/radar" },
  ]);
});

test("costs item uses costsOverview i18nKey (not costs)", () => {
  const section = costsCluster();

  const costsItem = sidebarVisibility.getSectionItems(section).find((i) => i.id === "costs");
  assert.ok(costsItem, "costs item must exist in costs section");
  assert.equal(costsItem.i18nKey, "costsOverview");
  assert.equal(costsItem.subtitleKey, "costsOverviewSubtitle");
});

test("costs item is not part of the analytics sub-group", () => {
  const observe = findSection("observe");
  assert.ok(observe, "observe section must exist");
  const group = observe.children.find((c) => "type" in c && c.id === "analytics-more");
  assert.ok(group && "items" in group, "analytics-more group must exist");
  assert.equal(
    group.items.some((i) => i.id === "costs"),
    false,
    "costs item must not be in the analytics sub-group"
  );
});

test("the costs row sits between Usage (analytics) and the request logs in Observe", () => {
  const observe = findSection("observe");
  assert.ok(observe, "observe section must exist");
  const ids = observe.children.map((c) => c.id);
  assert.ok(ids.indexOf("analytics") < ids.indexOf("costs"), ids.join(","));
  assert.ok(ids.indexOf("costs") < ids.indexOf("logs"), ids.join(","));
});

test("the costs sub-group titleKey is costsSection", () => {
  const observe = findSection("observe");
  const group = observe?.children.find((c) => "type" in c && c.id === "costs-more");
  assert.ok(group && "titleKey" in group);
  assert.equal(group.titleKey, "costsSection");
  assert.equal(group.titleFallback, "Costs");
});

// ---------------------------------------------------------------------------
// FIX 5 — the "radar" sidebar item must be gated on the RADAR_ENABLED feature
// flag (Sidebar.tsx has no built-in feature-flag awareness, so the item
// definition carries an opt-in `featureFlagKey`, and a small pure filter
// helper decides visibility given a resolved flags map).
// ---------------------------------------------------------------------------

test("FIX5: radar item declares featureFlagKey RADAR_ENABLED", () => {
  const section = costsCluster();

  const radarItem = sidebarVisibility.getSectionItems(section).find((i) => i.id === "radar");
  assert.ok(radarItem, "radar item must exist in costs section");
  assert.equal(radarItem.featureFlagKey, "RADAR_ENABLED");
});

test("FIX5: no other costs-section item declares a featureFlagKey (no regression)", () => {
  const section = costsCluster();

  const otherItems = sidebarVisibility.getSectionItems(section).filter((i) => i.id !== "radar");

  for (const item of otherItems) {
    assert.equal(
      item.featureFlagKey,
      undefined,
      `${item.id} must not be flag-gated (unexpected regression)`
    );
  }
});

test("FIX5: isSidebarItemVisibleForFlags — flag off => item hidden", () => {
  const section = costsCluster();
  const radarItem = sidebarVisibility.getSectionItems(section).find((i) => i.id === "radar")!;

  assert.equal(
    sidebarVisibility.isSidebarItemVisibleForFlags(radarItem, { RADAR_ENABLED: false }),
    false
  );
});

test("FIX5: isSidebarItemVisibleForFlags — flag on => item visible", () => {
  const section = costsCluster();
  const radarItem = sidebarVisibility.getSectionItems(section).find((i) => i.id === "radar")!;

  assert.equal(
    sidebarVisibility.isSidebarItemVisibleForFlags(radarItem, { RADAR_ENABLED: true }),
    true
  );
});

test("FIX5: isSidebarItemVisibleForFlags — flag unknown (not yet loaded) fails open => visible", () => {
  const section = costsCluster();
  const radarItem = sidebarVisibility.getSectionItems(section).find((i) => i.id === "radar")!;

  assert.equal(sidebarVisibility.isSidebarItemVisibleForFlags(radarItem, {}), true);
});

test("FIX5: isSidebarItemVisibleForFlags — items without featureFlagKey are always visible", () => {
  const section = costsCluster();
  const costsItem = sidebarVisibility.getSectionItems(section).find((i) => i.id === "costs")!;

  assert.equal(
    sidebarVisibility.isSidebarItemVisibleForFlags(costsItem, { RADAR_ENABLED: false }),
    true
  );
});
