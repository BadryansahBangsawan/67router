export const HIDEABLE_SIDEBAR_GROUP_IDS = [
  "routing-more",
  "compression-context",
  "optimize-more",
  "tools",
  "agents-more",
  "integrations",
  "analytics-more",
  "costs-more",
  "logs-more",
  "system",
  "audit-more",
  "configuration",
  "help",
  "gamification",
] as const;

export type HideableSidebarGroupId = (typeof HIDEABLE_SIDEBAR_GROUP_IDS)[number];

/**
 * Group ids renamed by sidebar v2 (67router): the "logs" / "audit" items became flat rows next
 * to their groups, so the groups took new ids. Saved `hiddenSidebarGroupLabels` keep working.
 */
export const LEGACY_SIDEBAR_GROUP_ID_MAP: Readonly<Record<string, HideableSidebarGroupId>> = {
  logs: "logs-more",
  audit: "audit-more",
};

/** Accepts current and legacy group ids (the settings schema validates against this). */
export const ACCEPTED_SIDEBAR_GROUP_IDS: readonly string[] = [
  ...HIDEABLE_SIDEBAR_GROUP_IDS,
  ...Object.keys(LEGACY_SIDEBAR_GROUP_ID_MAP),
];

export const HIDDEN_SIDEBAR_GROUP_LABELS_SETTING_KEY = "hiddenSidebarGroupLabels";

export function normalizeHiddenSidebarGroupLabels(value: unknown): HideableSidebarGroupId[] {
  if (!Array.isArray(value)) return [];

  const hiddenGroups = new Set<HideableSidebarGroupId>();

  for (const raw of value) {
    const item =
      typeof raw === "string" && Object.hasOwn(LEGACY_SIDEBAR_GROUP_ID_MAP, raw)
        ? LEGACY_SIDEBAR_GROUP_ID_MAP[raw]
        : raw;
    if (
      typeof item === "string" &&
      HIDEABLE_SIDEBAR_GROUP_IDS.includes(item as HideableSidebarGroupId)
    ) {
      hiddenGroups.add(item as HideableSidebarGroupId);
    }
  }

  return HIDEABLE_SIDEBAR_GROUP_IDS.filter((item) => hiddenGroups.has(item));
}
