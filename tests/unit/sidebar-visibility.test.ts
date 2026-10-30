import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");
const repoRoot = join(import.meta.dirname, "../..");

function sectionItems(sectionId: string) {
  const section = sidebarVisibility.SIDEBAR_SECTIONS.find(
    (candidate) => candidate.id === sectionId
  );
  assert.ok(section, `expected ${sectionId} sidebar section to exist`);
  return sidebarVisibility.getSectionItems(section);
}

// Sidebar v2 (67router): the full item order of each section — every page of the old
// OmniProxy / Analytics / Costs / Monitoring / Dev Tools / Agentic / Other / Configuration /
// Help sections, regrouped. Pins the IA so a page cannot silently drop out of the navigation.
test("v2 sidebar sections hold every page, in this order", () => {
  const ids = (sectionId: string) => sectionItems(sectionId).map((item) => item.id);
  assert.deepEqual(ids("routing"), [
    "home",
    "providers",
    "combos",
    "model-catalog",
    "combos-live",
    "quota",
    "costs-quota-share",
    "embedded-services",
  ]);
  assert.deepEqual(ids("optimize"), [
    "context-settings",
    "context-combos",
    "context-caveman",
    "context-rtk",
    "context-headroom",
    "context-session-dedup",
    "context-ccr",
    "context-llmlingua",
    "context-lite",
    "context-aggressive",
    "context-ultra",
    "context-omniglyph",
    "compression-studio",
    "compression-exclusions",
    "cache",
    "translator",
    "media",
    "playground",
    "search-tools",
    "chaos-config",
  ]);
  assert.deepEqual(ids("agents"), [
    "cli-agents",
    "skills",
    "cli-code",
    "acp-agents",
    "cloud-agents",
    "conductor",
    "orchestration",
    "agent-bridge",
    "traffic-inspector",
    "discovery",
    "agent-skills",
    "memory",
    "plugins",
  ]);
  assert.deepEqual(ids("access"), [
    "api-manager",
    "endpoints",
    "mcp",
    "a2a",
    "api-endpoints",
    "webhooks",
    "log-export",
  ]);
  assert.deepEqual(ids("observe"), [
    "analytics",
    "costs",
    "logs",
    "health",
    "audit",
    "analytics-combo-health",
    "analytics-utilization",
    "analytics-compression",
    "analytics-search",
    "analytics-evals",
    "provider-stats",
    "costs-pricing",
    "costs-budget",
    "costs-free-tiers",
    "free-provider-rankings",
    "radar",
    "activity",
    "logs-proxy",
    "logs-console",
    "logs-timeline",
    "conversations",
    "runtime",
    "resilience-connections",
    "resilience-cooldowns",
    "audit-mcp",
    "audit-a2a",
  ]);
  assert.deepEqual(ids("system").slice(0, 2), ["proxy", "settings-general"]);
  assert.ok(ids("system").includes("settings-sidebar"));
});

test("context sidebar group leads the Optimize section", () => {
  const sectionIds = sidebarVisibility.SIDEBAR_SECTIONS.map((section) => section.id);
  assert.deepEqual(sectionIds.slice(0, 2), ["routing", "optimize"]);

  const items = sectionItems("optimize");
  assert.deepEqual(
    items
      .filter((item) => item.id.startsWith("context-"))
      .map((item) => ({ id: item.id, href: item.href })),
    [
      { id: "context-settings", href: "/dashboard/context/settings" },
      { id: "context-combos", href: "/dashboard/context/combos" },
      { id: "context-caveman", href: "/dashboard/context/caveman" },
      { id: "context-rtk", href: "/dashboard/context/rtk" },
      { id: "context-headroom", href: "/dashboard/context/headroom" },
      { id: "context-session-dedup", href: "/dashboard/context/session-dedup" },
      { id: "context-ccr", href: "/dashboard/context/ccr" },
      { id: "context-llmlingua", href: "/dashboard/context/llmlingua" },
      { id: "context-lite", href: "/dashboard/context/lite" },
      { id: "context-aggressive", href: "/dashboard/context/aggressive" },
      { id: "context-ultra", href: "/dashboard/context/ultra" },
      { id: "context-omniglyph", href: "/dashboard/context/omniglyph" },
    ]
  );
});

test("sidebar visibility drops stale entries from saved settings", () => {
  const allSidebarItemIds = sidebarVisibility.SIDEBAR_SECTIONS.flatMap((section) =>
    sidebarVisibility.getSectionItems(section).map((item) => item.id)
  );

  assert.equal(
    (sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS as readonly string[]).includes("auto-combo"),
    false
  );
  assert.equal((allSidebarItemIds as string[]).includes("auto-combo"), false);
  assert.equal(
    (sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS as readonly string[]).includes("settings"),
    false
  );
  assert.equal((allSidebarItemIds as string[]).includes("settings"), false);
  assert.deepEqual(sidebarVisibility.normalizeHiddenSidebarItems(["auto-combo" as any, "logs"]), [
    "logs",
  ]);
});

test("help sidebar exposes changelog after docs and issues", () => {
  // Sidebar v2: Help is a sub-group of System.
  const items = sectionItems("system").filter((item) =>
    ["docs", "issues", "changelog"].includes(item.id)
  );
  assert.deepEqual(
    items.map((item) => ({
      id: item.id,
      href: item.href,
      i18nKey: item.i18nKey,
    })),
    [
      { id: "docs", href: "/docs", i18nKey: "docs" },
      {
        id: "issues",
        href: "https://github.com/cheaper-inference/OmniRoute/issues",
        i18nKey: "issues",
      },
      { id: "changelog", href: "/dashboard/changelog", i18nKey: "changelog" },
    ]
  );
  assert.equal(sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS.includes("changelog"), true);
});

test("plugins has a discoverable sidebar entry (#3656 follow-up)", async () => {
  const items = sectionItems("agents"); // sidebar v2 (ex Agentic Features)
  const plugins = items.find((item) => item.id === "plugins");
  assert.ok(plugins, "expected a plugins item in the agents section");
  assert.equal(plugins.href, "/dashboard/plugins");
  assert.equal(sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS.includes("plugins"), true);

  // It must be a real page (plugin manager), not a legacy redirect stub.
  const pluginsPage = await readFile(
    join(repoRoot, "src/app/(dashboard)/dashboard/plugins/page.tsx"),
    "utf8"
  );
  assert.doesNotMatch(pluginsPage, /^\s*redirect\(/m);
  // R0.2: marketplace tab removed (dead code) — verify the page still has plugin management UI.
  assert.match(pluginsPage, /scanForPlugins|installedTab|fetchPlugins/i);
});

test("model catalog is available from the Routing sidebar and can be hidden", () => {
  const item = sectionItems("routing").find((candidate) => candidate.id === "model-catalog");
  assert.ok(item, "expected the model catalog sidebar item to exist");
  assert.equal(item.href, "/dashboard/models");
  assert.equal(sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS.includes("model-catalog"), true);
});

test("legacy dashboard routes redirect to their consolidated surfaces", async () => {
  const autoComboPage = await readFile(
    join(repoRoot, "src/app/(dashboard)/dashboard/auto-combo/page.tsx"),
    "utf8"
  );
  const usagePage = await readFile(
    join(repoRoot, "src/app/(dashboard)/dashboard/usage/page.tsx"),
    "utf8"
  );
  const settingsPage = await readFile(
    join(repoRoot, "src/app/(dashboard)/dashboard/settings/page.tsx"),
    "utf8"
  );

  assert.match(autoComboPage, /redirect\("\/dashboard\/combos\?filter=intelligent"\)/);
  assert.match(usagePage, /redirect\("\/dashboard\/logs"\)/);
  assert.match(settingsPage, /redirect\(resolveSettingsRoute\(tab\)\)/);
  assert.match(settingsPage, /\/dashboard\/settings\/general/);

  const compressionPage = await readFile(
    join(repoRoot, "src/app/(dashboard)/dashboard/compression/page.tsx"),
    "utf8"
  );
  assert.match(compressionPage, /redirect\("\/dashboard\/context\/caveman"\)/);
});
