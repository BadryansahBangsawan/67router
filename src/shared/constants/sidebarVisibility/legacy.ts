import { LEGACY_SIDEBAR_GROUP_ID_MAP } from "../sidebarGroupVisibility";
import { LEGACY_SIDEBAR_SECTION_ITEMS, SIDEBAR_SECTIONS } from "./sections";
import type { LegacySidebarSectionId, SidebarItemOrder, SidebarSectionId } from "./types";

/**
 * Sidebar v2 (67router) regrouped the navigation into Routing / Optimize / Agents / Access /
 * Observe / System. Section ids are persisted in settings (`hiddenSidebarSections`,
 * `sidebarSectionOrder`, `sidebarItemOrder` keys) and in localStorage (expanded / pinned
 * sections), so every saved id from before v2 is mapped onto the section that now holds most of
 * its items. Item ids and group ids are unchanged (except the two groups in
 * sidebarGroupVisibility.ts → LEGACY_SIDEBAR_GROUP_ID_MAP).
 */
export const LEGACY_SIDEBAR_SECTION_ID_MAP: Readonly<
  Record<LegacySidebarSectionId, Exclude<SidebarSectionId, "pinned">>
> = {
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
};

export const SIDEBAR_SECTION_IDS: readonly SidebarSectionId[] = [
  "pinned",
  "routing",
  "optimize",
  "agents",
  "access",
  "observe",
  "system",
];

export const LEGACY_SIDEBAR_SECTION_IDS = Object.keys(
  LEGACY_SIDEBAR_SECTION_ID_MAP
) as LegacySidebarSectionId[];

export function isLegacySidebarSectionId(id: unknown): id is LegacySidebarSectionId {
  return typeof id === "string" && Object.hasOwn(LEGACY_SIDEBAR_SECTION_ID_MAP, id);
}

/** Current id unchanged, legacy id → its v2 section, anything else → null. */
export function migrateSidebarSectionId(id: unknown): SidebarSectionId | null {
  if (typeof id !== "string") return null;
  if ((SIDEBAR_SECTION_IDS as readonly string[]).includes(id)) return id as SidebarSectionId;
  return isLegacySidebarSectionId(id) ? LEGACY_SIDEBAR_SECTION_ID_MAP[id] : null;
}

/** Maps a list of ids (order kept, first occurrence wins, unknown ids dropped). */
export function migrateSidebarSectionIds(value: unknown): SidebarSectionId[] {
  if (!Array.isArray(value)) return [];
  const out: SidebarSectionId[] = [];
  for (const raw of value) {
    const id = migrateSidebarSectionId(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** v2 section id → the item ids it holds (groups flattened). */
const V2_SECTION_ITEMS: ReadonlyMap<SidebarSectionId, readonly string[]> = new Map(
  SIDEBAR_SECTIONS.map((section) => [
    section.id,
    section.children.flatMap((child) =>
      "type" in child && child.type === "group" ? child.items.map((i) => i.id) : [child.id]
    ),
  ])
);

/** Legacy sections that contributed at least one page to a v2 section. */
function legacySourcesOf(sectionId: SidebarSectionId): LegacySidebarSectionId[] {
  const items = V2_SECTION_ITEMS.get(sectionId) ?? [];
  return LEGACY_SIDEBAR_SECTION_IDS.filter((legacy) =>
    LEGACY_SIDEBAR_SECTION_ITEMS[legacy].some((id) => items.includes(id))
  );
}

function savedIdSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
}

/**
 * Hidden sections are migrated conservatively: a v2 section is hidden only when the saved list
 * already names it, or when EVERY legacy section that contributed any page to it was hidden.
 * Agents, for instance, holds Agentic Features pages AND the CLI agents / Tools pages from
 * OmniProxy, so hiding "agentic-features" alone must not hide the whole Agents section. Pages
 * of a partly-hidden legacy section are hidden one by one instead
 * (`resolveLegacyHiddenSidebarItems()` in sidebarVisibility.ts).
 */
export function migrateHiddenSidebarSectionIds(value: unknown): SidebarSectionId[] {
  if (!Array.isArray(value)) return [];
  const saved = savedIdSet(value);
  const out: SidebarSectionId[] = [];
  for (const id of SIDEBAR_SECTION_IDS) {
    if (saved.has(id)) {
      out.push(id);
      continue;
    }
    const sources = legacySourcesOf(id);
    if (sources.length > 0 && sources.every((legacy) => saved.has(legacy))) out.push(id);
  }
  return out;
}

/**
 * Hidden legacy sections whose pages are NOT all inside a hidden v2 section. These are kept on
 * the saved list so the pages they held stay hidden page by page.
 */
export function partlyHiddenLegacySidebarSectionIds(value: unknown): LegacySidebarSectionId[] {
  if (!Array.isArray(value)) return [];
  const saved = savedIdSet(value);
  const hidden = migrateHiddenSidebarSectionIds(value);
  const hiddenItems = new Set(hidden.flatMap((id) => V2_SECTION_ITEMS.get(id) ?? []));
  return LEGACY_SIDEBAR_SECTION_IDS.filter(
    (legacy) =>
      saved.has(legacy) && LEGACY_SIDEBAR_SECTION_ITEMS[legacy].some((id) => !hiddenItems.has(id))
  );
}

/**
 * What the settings schema stores for `hiddenSidebarSections`: the v2 sections to hide, then
 * the partly-hidden legacy ids (nothing the user hid is lost, nothing extra gets hidden).
 */
export function persistHiddenSidebarSectionIds(
  value: unknown
): (SidebarSectionId | LegacySidebarSectionId)[] {
  return [...migrateHiddenSidebarSectionIds(value), ...partlyHiddenLegacySidebarSectionIds(value)];
}

/** Item ids held by the given legacy sections, in catalog order. */
export function legacySidebarSectionItemIds(ids: readonly LegacySidebarSectionId[]): string[] {
  return [...new Set(ids.flatMap((legacy) => LEGACY_SIDEBAR_SECTION_ITEMS[legacy]))];
}

/** Item ids inside the given v2 sections. */
export function sidebarSectionItemIds(ids: readonly SidebarSectionId[]): Set<string> {
  return new Set(ids.flatMap((id) => V2_SECTION_ITEMS.get(id) ?? []));
}

/**
 * Per-section item order: legacy keys are merged into their v2 section (current key first, then
 * legacy keys in catalog order), ids de-duplicated. Child ids are unchanged, so a saved order
 * still sorts the items it names; `applyItemOrder()` ignores ids a section does not hold. The
 * two renamed Monitoring groups expand to row + group (LEGACY_SIDEBAR_GROUP_ID_MAP).
 */
export function migrateSidebarItemOrder(value: unknown): SidebarItemOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: SidebarItemOrder = {};
  const append = (target: SidebarSectionId, ids: unknown, legacy = false) => {
    if (!Array.isArray(ids)) return;
    const list = (out[target] ??= []);
    for (const id of ids) {
      if (typeof id !== "string") continue;
      // In a legacy order "logs" / "audit" named the Monitoring groups; v2 splits each into a
      // flat row plus a renamed group, so both take the group's place.
      const expanded =
        legacy && Object.hasOwn(LEGACY_SIDEBAR_GROUP_ID_MAP, id)
          ? [id, LEGACY_SIDEBAR_GROUP_ID_MAP[id]]
          : [id];
      for (const next of expanded) if (!list.includes(next)) list.push(next);
    }
  };
  for (const id of SIDEBAR_SECTION_IDS) append(id, source[id]);
  for (const legacy of LEGACY_SIDEBAR_SECTION_IDS) {
    append(LEGACY_SIDEBAR_SECTION_ID_MAP[legacy], source[legacy], true);
  }
  for (const key of Object.keys(out) as SidebarSectionId[]) {
    if (out[key]?.length === 0) delete out[key];
  }
  return out;
}
