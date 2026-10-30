import test from "node:test";
import assert from "node:assert/strict";

// Sidebar v2 (67router): six sections (Routing / Optimize / Agents / Access / Observe / System)
// composed from the existing item catalog. Saved settings from before v2 use the old section and
// group ids; these tests pin the mapping and that every saved preference still loads.

const sidebar = await import("../../src/shared/constants/sidebarVisibility.ts");
const groups = await import("../../src/shared/constants/sidebarGroupVisibility.ts");
const { updateSettingsSchema } = await import("../../src/shared/validation/settingsSchemas.ts");

const {
  SIDEBAR_SECTIONS,
  HIDEABLE_SIDEBAR_ITEM_IDS,
  LEGACY_SIDEBAR_SECTION_ID_MAP,
  applySectionOrder,
  applyItemOrder,
  getSectionItems,
  migrateHiddenSidebarSectionIds,
  migrateSidebarItemOrder,
  migrateSidebarSectionId,
  migrateSidebarSectionIds,
  normalizeHiddenSidebarSections,
  resolveRuntimeSidebarSections,
} = sidebar;

const sectionIds = () => SIDEBAR_SECTIONS.map((section) => section.id);
const childIds = (sectionId: string) =>
  SIDEBAR_SECTIONS.find((section) => section.id === sectionId)!.children.map((child) => child.id);
const allItemIds = () => SIDEBAR_SECTIONS.flatMap((s) => getSectionItems(s).map((i) => i.id));

test("v2 sections are Routing, Optimize, Agents, Access, Observe, System — in that order", () => {
  assert.deepEqual(sectionIds(), ["routing", "optimize", "agents", "access", "observe", "system"]);
  // Every v2 section starts pinned (always open), the design's flat look.
  assert.ok(SIDEBAR_SECTIONS.every((section) => section.defaultPinned === true));
});

test("each section leads with the design's headline entries, mapped to existing routes", () => {
  const flatHead = (sectionId: string) =>
    SIDEBAR_SECTIONS.find((s) => s.id === sectionId)!
      .children.filter((child) => !("type" in child))
      .map((child) => [child.id, (child as { href: string }).href]);
  assert.deepEqual(flatHead("routing"), [
    ["home", "/home"], // Overview
    ["providers", "/dashboard/providers"],
    ["combos", "/dashboard/combos"],
    ["model-catalog", "/dashboard/models"], // Models
  ]);
  assert.deepEqual(flatHead("optimize"), [
    ["cache", "/dashboard/cache"],
    ["translator", "/dashboard/translator"],
  ]);
  assert.deepEqual(childIds("optimize")[0], "compression-context"); // Context & compression
  assert.deepEqual(flatHead("agents"), [
    ["cli-agents", "/dashboard/cli-agents"], // Agents
    ["skills", "/dashboard/omni-skills"],
  ]);
  assert.deepEqual(flatHead("access"), [
    ["api-manager", "/dashboard/api-manager"], // API keys
    ["endpoints", "/dashboard/endpoint"], // Endpoint (MCP · A2A tabs)
  ]);
  assert.deepEqual(flatHead("observe"), [
    ["analytics", "/dashboard/analytics"], // Usage
    ["costs", "/dashboard/costs"], // Analytics slot (spend)
    ["logs", "/dashboard/logs"], // Request logs
    ["health", "/dashboard/health"],
    ["audit", "/dashboard/audit"],
  ]);
  assert.deepEqual(flatHead("system"), [["proxy", "/dashboard/system/proxy"]]); // Proxies
  assert.ok(childIds("system").includes("configuration"), "Settings sub-group");
});

test("no page lost its sidebar entry: every item appears exactly once", () => {
  const ids = allItemIds();
  assert.equal(new Set(ids).size, ids.length, "no duplicate item");
  // Every hideable id that had an entry before v2 still has one (mitm-proxy / 1proxy were
  // never in the catalog; radar-admin is materialized at runtime).
  const notInCatalog = new Set(["mitm-proxy", "1proxy", "radar-admin", "logs-activity"]);
  for (const id of HIDEABLE_SIDEBAR_ITEM_IDS) {
    if (notInCatalog.has(id)) continue;
    assert.ok(ids.includes(id), `item ${id} is still in the sidebar`);
  }
  assert.ok(ids.includes("proxy"));
});

test("within a section, child ids (items and sub-groups) are unique — item ordering keys", () => {
  for (const section of SIDEBAR_SECTIONS) {
    const ids = childIds(section.id);
    assert.equal(new Set(ids).size, ids.length, `${section.id}: ${ids.join(",")}`);
  }
});

test("every pre-v2 section id maps to a v2 section", () => {
  assert.deepEqual(LEGACY_SIDEBAR_SECTION_ID_MAP, {
    home: "routing",
    "omni-proxy": "routing",
    analytics: "observe",
    costs: "observe",
    monitoring: "observe",
    devtools: "optimize",
    "agentic-features": "agents",
    "other-features": "system",
    configuration: "system",
    help: "system",
  });
  for (const target of Object.values(LEGACY_SIDEBAR_SECTION_ID_MAP)) {
    assert.ok(sectionIds().includes(target));
  }
  assert.equal(migrateSidebarSectionId("routing"), "routing");
  assert.equal(migrateSidebarSectionId("monitoring"), "observe");
  assert.equal(migrateSidebarSectionId("constructor"), null, "no prototype keys");
  assert.equal(migrateSidebarSectionId("nope"), null);
});

test("a saved pre-v2 section order still sorts the v2 sections", () => {
  assert.deepEqual(migrateSidebarSectionIds(["help", "configuration", "omni-proxy", "home"]), [
    "system",
    "routing",
  ]);
  const ordered = applySectionOrder(SIDEBAR_SECTIONS, ["configuration", "devtools"] as never);
  assert.deepEqual(
    ordered.map((s) => s.id),
    ["system", "optimize", "routing", "agents", "access", "observe"]
  );
});

test("hidden pre-v2 sections hide a v2 section only when all of its sources were hidden", () => {
  // "costs" alone must not hide Observe (Usage, Logs, Health… were visible).
  assert.deepEqual(migrateHiddenSidebarSectionIds(["costs"]), []);
  assert.deepEqual(migrateHiddenSidebarSectionIds(["analytics", "costs", "monitoring"]), [
    "observe",
  ]);
  assert.deepEqual(migrateHiddenSidebarSectionIds(["devtools", "agentic-features"]), [
    "optimize",
    "agents",
  ]);
  assert.deepEqual(migrateHiddenSidebarSectionIds(["access", "junk", 3]), ["access"]);
  // System holds the protected items (proxy, settings-sidebar): never hideable.
  assert.deepEqual(
    normalizeHiddenSidebarSections(["other-features", "configuration", "help", "devtools"]),
    ["optimize"]
  );
});

test("a saved pre-v2 item order is merged into the v2 section that now holds the items", () => {
  const migrated = migrateSidebarItemOrder({
    "omni-proxy": ["combos", "providers"],
    home: ["home"],
    observe: ["logs"],
    monitoring: ["health", "logs"],
    junk: ["x"],
  });
  // Current key first, then legacy keys in catalog order (home before omni-proxy).
  assert.deepEqual(migrated, {
    routing: ["home", "combos", "providers"],
    observe: ["logs", "health"],
  });
  const routing = SIDEBAR_SECTIONS.find((s) => s.id === "routing")!;
  const sorted = applyItemOrder(routing.children, migrated.routing!).map((c) => c.id);
  assert.deepEqual(sorted.slice(0, 3), ["home", "combos", "providers"]);
  assert.deepEqual(migrateSidebarItemOrder(null), {});
  assert.deepEqual(migrateSidebarItemOrder(["a"]), {});
});

test("renamed sub-groups keep saved hidden group labels; all v2 groups are hideable", () => {
  assert.deepEqual(groups.normalizeHiddenSidebarGroupLabels(["logs", "audit", "tools", "zzz"]), [
    "tools",
    "logs-more",
    "audit-more",
  ]);
  assert.deepEqual(groups.normalizeHiddenSidebarGroupLabels(["constructor"]), []);
  const groupIds = SIDEBAR_SECTIONS.flatMap((s) =>
    s.children.filter((c) => "type" in c && c.type === "group").map((c) => c.id)
  );
  for (const id of groupIds) {
    assert.ok(
      (groups.HIDEABLE_SIDEBAR_GROUP_IDS as readonly string[]).includes(id),
      `group ${id} is hideable`
    );
  }
});

test("the settings schema accepts pre-v2 ids and stores v2 ids", () => {
  const parsed = updateSettingsSchema.safeParse({
    hiddenSidebarSections: ["devtools", "costs"],
    sidebarSectionOrder: ["help", "omni-proxy", "routing"],
    hiddenSidebarGroupLabels: ["logs", "integrations"],
    sidebarItemOrder: { "omni-proxy": ["combos"], configuration: ["settings-sidebar"] },
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.deepEqual(parsed.data.hiddenSidebarSections, ["optimize"]);
  assert.deepEqual(parsed.data.sidebarSectionOrder, ["system", "routing"]);
  assert.deepEqual(parsed.data.hiddenSidebarGroupLabels, ["integrations", "logs-more"]);
  assert.deepEqual(parsed.data.sidebarItemOrder, {
    routing: ["combos"],
    system: ["settings-sidebar"],
  });
  // Unknown ids are still rejected, as before.
  assert.equal(updateSettingsSchema.safeParse({ sidebarSectionOrder: ["bogus"] }).success, false);
  assert.equal(
    updateSettingsSchema.safeParse({ hiddenSidebarGroupLabels: ["bogus"] }).success,
    false
  );
});

test("the owner-only Radar Admin entry still lands right after Radar (now in Observe → Costs)", () => {
  const resolved = resolveRuntimeSidebarSections(SIDEBAR_SECTIONS, {
    radarAdminUrl: "https://radar.example.com/admin",
  });
  const observe = resolved.find((s) => s.id === "observe")!;
  const costs = observe.children.find((c) => "type" in c && c.id === "costs-more") as {
    items: readonly { id: string }[];
  };
  const ids = costs.items.map((i) => i.id);
  assert.equal(ids[ids.indexOf("radar") + 1], "radar-admin");
});
