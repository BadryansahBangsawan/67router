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

/**
 * Hidden sections are migrated conservatively: a v2 section is hidden only when the saved list
 * already names it, or when EVERY legacy section folded into it was hidden. Hiding "costs" alone
 * must not hide the whole Observe section (Usage, Logs, Health… were visible before).
 */
export function migrateHiddenSidebarSectionIds(value: unknown): SidebarSectionId[] {
  if (!Array.isArray(value)) return [];
  const saved = new Set(value.filter((id): id is string => typeof id === "string"));
  const out: SidebarSectionId[] = [];
  for (const id of SIDEBAR_SECTION_IDS) {
    if (saved.has(id)) {
      out.push(id);
      continue;
    }
    const sources = LEGACY_SIDEBAR_SECTION_IDS.filter(
      (legacy) => LEGACY_SIDEBAR_SECTION_ID_MAP[legacy] === id
    );
    if (sources.length > 0 && sources.every((legacy) => saved.has(legacy))) out.push(id);
  }
  return out;
}

/**
 * Per-section item order: legacy keys are merged into their v2 section (current key first, then
 * legacy keys in catalog order), ids de-duplicated. Child ids are unchanged, so a saved order
 * still sorts the items it names; `applyItemOrder()` ignores ids a section does not hold.
 */
export function migrateSidebarItemOrder(value: unknown): SidebarItemOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: SidebarItemOrder = {};
  const append = (target: SidebarSectionId, ids: unknown) => {
    if (!Array.isArray(ids)) return;
    const list = (out[target] ??= []);
    for (const id of ids) if (typeof id === "string" && !list.includes(id)) list.push(id);
  };
  for (const id of SIDEBAR_SECTION_IDS) append(id, source[id]);
  for (const legacy of LEGACY_SIDEBAR_SECTION_IDS) {
    append(LEGACY_SIDEBAR_SECTION_ID_MAP[legacy], source[legacy]);
  }
  for (const key of Object.keys(out) as SidebarSectionId[]) {
    if (out[key]?.length === 0) delete out[key];
  }
  return out;
}
