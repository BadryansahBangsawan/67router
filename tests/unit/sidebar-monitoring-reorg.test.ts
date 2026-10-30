import test from "node:test";
import assert from "node:assert/strict";

// Sidebar v2 (67router): the Monitoring section folded into Observe. The headline rows are flat
// (Usage, Costs, Request logs, Health, Audit) and the remaining monitoring pages sit in Observe's
// sub-groups — the same pages as the old Monitoring section, regrouped.

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

function observe() {
  const section = sidebarVisibility.SIDEBAR_SECTIONS.find((s) => s.id === "observe");
  assert.ok(section, "observe section must exist");
  return section;
}

function group(id: string) {
  const found = observe().children.find(
    (c): c is sidebarVisibility.SidebarItemGroup => "type" in c && c.type === "group" && c.id === id
  );
  assert.ok(found, `${id} group must exist in observe`);
  return found;
}

test("the legacy monitoring section id maps to observe", () => {
  assert.equal(sidebarVisibility.migrateSidebarSectionId("monitoring"), "observe");
});

test("observe leads with flat rows, then the sub-groups", () => {
  const children = observe().children;
  const flat = children.filter((c) => !("type" in c)).map((c) => c.id);
  const groups = children.filter((c) => "type" in c && c.type === "group").map((c) => c.id);
  assert.deepEqual(flat, ["analytics", "costs", "logs", "health", "audit"]);
  assert.deepEqual(groups, ["analytics-more", "costs-more", "logs-more", "system", "audit-more"]);
  // Flat rows come first.
  const firstGroup = children.findIndex((c) => "type" in c);
  assert.ok(children.slice(firstGroup).every((c) => "type" in c && c.type === "group"));
});

test("getSectionItems of observe does NOT contain logs-activity", () => {
  const itemIds = sidebarVisibility.getSectionItems(observe()).map((i) => i.id);
  assert.equal(
    itemIds.includes("logs-activity" as sidebarVisibility.HideableSidebarItemId),
    false,
    "logs-activity must not be in observe section items"
  );
});

test("observe does NOT have a group with id costs-parameters", () => {
  const groupIds = observe()
    .children.filter((c) => "type" in c && c.type === "group")
    .map((g) => g.id);
  assert.equal(groupIds.includes("costs-parameters"), false);
});

test("activity item keeps its href and icon (now in the logs sub-group)", () => {
  const activityItem = group("logs-more").items.find((i) => i.id === "activity");
  assert.ok(activityItem, "activity item must be in the logs sub-group");
  assert.equal(activityItem.href, "/dashboard/activity");
  assert.equal(activityItem.icon, "timeline");
  assert.equal(activityItem.i18nKey, "activity");
});

test("request logs is a flat row; the other log pages are in the logs sub-group", () => {
  const logs = observe().children.find((c) => !("type" in c) && c.id === "logs");
  assert.ok(logs && "href" in logs);
  assert.equal(logs.href, "/dashboard/logs");
  assert.deepEqual(
    group("logs-more").items.map((i) => i.id),
    ["activity", "logs-proxy", "logs-console", "logs-timeline", "conversations"]
  );
});

test("health is a flat row; runtime and resilience are in the runtime sub-group", () => {
  const health = observe().children.find((c) => !("type" in c) && c.id === "health");
  assert.ok(health, "health row");
  assert.deepEqual(
    group("system").items.map((i) => i.id),
    ["runtime", "resilience-connections", "resilience-cooldowns"]
  );
});
