"use client";

import { Fragment, useState, useEffect, useCallback, useSyncExternalStore, useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { getActiveSidebarHref } from "@/shared/utils/sidebarRouteMatch";
import { filterSidebarSectionsByQuery } from "@/shared/utils/sidebarSearch";
import {
  expandActiveSection,
  hydrateExpandedSections,
  toggleExpandedSection,
} from "@/shared/utils/sidebarExpansionState";
import { APP_CONFIG } from "@/shared/constants/appConfig";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@omniroute/ui-kit/sidebar";
import OmniRouteLogo, { OmniRouteLockup } from "./OmniRouteLogo";
import Icon from "./Icon";
import Button from "./Button";
import Input from "./Input";
import Modal, { ConfirmModal } from "./Modal";
import CloudSyncStatus from "./CloudSyncStatus";
import { useTranslations } from "next-intl";
import {
  HIDDEN_SIDEBAR_GROUP_LABELS_SETTING_KEY,
  normalizeHiddenSidebarGroupLabels,
} from "@/shared/constants/sidebarGroupVisibility";
import {
  HIDDEN_SIDEBAR_ITEMS_SETTING_KEY,
  HIDDEN_SIDEBAR_SECTIONS_SETTING_KEY,
  SIDEBAR_SETTINGS_UPDATED_EVENT,
  SIDEBAR_SECTION_ORDER_KEY,
  SIDEBAR_ITEM_ORDER_KEY,
  SIDEBAR_SECTIONS,
  normalizeHiddenSidebarSections,
  resolveHiddenSidebarItems,
  applySectionOrder,
  applyItemOrder,
  isSidebarItemVisibleForFlags,
  migrateSidebarItemOrder,
  migrateSidebarSectionIds,
  resolveRuntimeSidebarSections,
  type SidebarSectionId,
  type SidebarItemDefinition,
  type SidebarItemGroup,
  type SidebarItemOrder,
} from "@/shared/constants/sidebarVisibility";

function subscribeDir(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
  return () => observer.disconnect();
}

/** Kit Sidebar side: right-anchored under dir="rtl" (ar, fa, he, ur), left otherwise. */
export function useSidebarSide(): "left" | "right" {
  return useSyncExternalStore(
    subscribeDir,
    () => (document.documentElement.dir === "rtl" ? "right" : "left"),
    () => "left"
  );
}

const isE2EMode = process.env.NEXT_PUBLIC_OMNIROUTE_E2E_MODE === "1";
const DEFAULT_EXPANDED: SidebarSectionId = "routing";
// Sidebar v2 (67router) regrouped the sections, so the per-browser expanded / pinned SECTION
// state starts fresh under new keys: every v2 section is `defaultPinned` (always open, the
// design's flat look) until the user unpins it. Pinned ITEMS keep their key — item ids did not
// change. Saved settings (hidden sections, orders) are migrated, see sidebarVisibility/legacy.ts.
const EXPANDED_SECTIONS_KEY = "sidebar-expanded-sections-v2";
const PINNED_SECTIONS_KEY = "sidebar-pinned-sections-v2";
const PINNED_ITEMS_KEY = "sidebar-pinned-items";

type SidebarProps = {
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isMacElectron?: boolean;
};

function parseStoredArray<T>(raw: string | null, fallback: T): T {
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T;
    }
  } catch {}
  return fallback;
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// useSyncExternalStore plumbing for the one-shot localStorage hydration reads:
// nothing to subscribe to (the values are only read once, before
// sidebarExpansionLoaded flips), and the server snapshot is always null so the
// SSR/hydration render matches the server output.
const noopSubscribe = () => () => {};
const getServerSnapshotNull = () => null;
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;
function readStoredExpandedRaw() {
  try {
    return localStorage.getItem(EXPANDED_SECTIONS_KEY);
  } catch {
    return null;
  }
}
function readStoredPinnedRaw() {
  try {
    return localStorage.getItem(PINNED_SECTIONS_KEY);
  } catch {
    return null;
  }
}
function readStoredPinnedItemsRaw() {
  try {
    return localStorage.getItem(PINNED_ITEMS_KEY);
  } catch {
    return null;
  }
}

/**
 * Dashboard navigation. Must render inside the kit `SidebarProvider` + `<Sidebar>` (DashboardShell
 * does that): the collapsed/mobile state comes from `useSidebar()`. `collapsed`, `onToggleCollapse`
 * and `onClose` stay in the props type for older callers and are ignored.
 */
export default function Sidebar({ isMacElectron = false }: SidebarProps) {
  const navigationId = useId();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const [groupPathname, setGroupPathname] = useState(pathname);
  if (groupPathname !== pathname) {
    setGroupPathname(pathname);
    setExpandedGroups({});
  }
  const t = useTranslations("sidebar");
  const tc = useTranslations("common");
  const { state: sidebarState, isMobile } = useSidebar();
  const collapsed = sidebarState === "collapsed" && !isMobile;
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [hiddenSidebarItems, setHiddenSidebarItems] = useState<string[]>([]);
  const [hiddenSidebarSections, setHiddenSidebarSections] = useState<SidebarSectionId[]>([]);
  const [hiddenSidebarGroupLabels, setHiddenSidebarGroupLabels] = useState<string[]>([]);
  // Feature-flag map for flag-gated items (e.g. "radar" -> RADAR_ENABLED).
  // Fails open (see isSidebarItemVisibleForFlags) so a missing key never
  // hides an unrelated item — only set once /api/settings resolves.
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [radarAdminUrl, setRadarAdminUrl] = useState<unknown>(null);
  const [sidebarSectionOrder, setSidebarSectionOrder] = useState<SidebarSectionId[]>([]);
  const [sidebarItemOrder, setSidebarItemOrder] = useState<SidebarItemOrder>({});
  const [customAppName, setCustomAppName] = useState<string | null>(null);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<SidebarSectionId>>(
    new Set([DEFAULT_EXPANDED])
  );
  const [pinnedSections, setPinnedSections] = useState<Set<SidebarSectionId>>(new Set());
  const [pinnedItems, setPinnedItems] = useState<Set<string>>(new Set());
  const [pinnedSectionCollapsed, setPinnedSectionCollapsed] = useState(false);
  const [sidebarExpansionLoaded, setSidebarExpansionLoaded] = useState(false);
  const [skipInitialActiveExpansion, setSkipInitialActiveExpansion] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Load persisted state once the client has hydrated. A stored [] intentionally
  // means "all sections collapsed". localStorage is read through
  // useSyncExternalStore snapshots (server snapshot: null) and the states are
  // adjusted during render (react.dev "You Might Not Need an Effect") so the
  // stored expansion applies before paint without a synchronous effect setState.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  );
  const storedExpandedRaw = useSyncExternalStore(
    noopSubscribe,
    readStoredExpandedRaw,
    getServerSnapshotNull
  );
  const storedPinnedRaw = useSyncExternalStore(
    noopSubscribe,
    readStoredPinnedRaw,
    getServerSnapshotNull
  );
  const storedPinnedItemsRaw = useSyncExternalStore(
    noopSubscribe,
    readStoredPinnedItemsRaw,
    getServerSnapshotNull
  );
  if (hydrated && !sidebarExpansionLoaded) {
    const storedExpanded = parseStoredArray<SidebarSectionId[]>(storedExpandedRaw, [
      DEFAULT_EXPANDED,
    ]);
    const storedPinned: SidebarSectionId[] =
      storedPinnedRaw !== null
        ? parseStoredArray<SidebarSectionId[]>(storedPinnedRaw, [])
        : (SIDEBAR_SECTIONS.filter((s) => s.defaultPinned).map((s) => s.id) as SidebarSectionId[]);
    const storedPinnedItems = parseStoredArray<string[]>(storedPinnedItemsRaw, []);

    const initialPinned = new Set<SidebarSectionId>(storedPinned);
    const initialExpanded = hydrateExpandedSections(storedExpanded, initialPinned);

    setSkipInitialActiveExpansion(storedExpanded.length === 0);
    setExpandedSections(initialExpanded);
    setPinnedSections(initialPinned);
    setPinnedItems(new Set(storedPinnedItems));
    setSidebarExpansionLoaded(true);
  }

  useEffect(() => {
    const applySettings = (data) => {
      setShowDebug(data?.debugMode === true);
      // A saved pre-v2 section id that only partly maps onto a v2 section hides its pages.
      setHiddenSidebarItems(
        resolveHiddenSidebarItems(
          data?.[HIDDEN_SIDEBAR_ITEMS_SETTING_KEY],
          data?.[HIDDEN_SIDEBAR_SECTIONS_SETTING_KEY]
        )
      );
      setHiddenSidebarSections(
        normalizeHiddenSidebarSections(data?.[HIDDEN_SIDEBAR_SECTIONS_SETTING_KEY])
      );
      setHiddenSidebarGroupLabels(
        normalizeHiddenSidebarGroupLabels(data?.[HIDDEN_SIDEBAR_GROUP_LABELS_SETTING_KEY])
      );
      setCustomAppName(data?.instanceName || null);
      setCustomLogo(data?.customLogoBase64 || data?.customLogoUrl || null);
      if (typeof data?.radarEnabled === "boolean") {
        setFeatureFlags((prev) => ({ ...prev, RADAR_ENABLED: data.radarEnabled }));
      }
      setRadarAdminUrl(data?.radarAdminUrl ?? null);
    };

    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        applySettings(data);
        if (Array.isArray(data?.[SIDEBAR_SECTION_ORDER_KEY])) {
          setSidebarSectionOrder(migrateSidebarSectionIds(data[SIDEBAR_SECTION_ORDER_KEY]));
        }
        if (data?.[SIDEBAR_ITEM_ORDER_KEY] && typeof data[SIDEBAR_ITEM_ORDER_KEY] === "object") {
          setSidebarItemOrder(migrateSidebarItemOrder(data[SIDEBAR_ITEM_ORDER_KEY]));
        }
      })
      .catch(() => {});

    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
      if ("debugMode" in detail) setShowDebug(detail.debugMode === true);
      if (HIDDEN_SIDEBAR_ITEMS_SETTING_KEY in detail) {
        setHiddenSidebarItems(
          resolveHiddenSidebarItems(
            detail[HIDDEN_SIDEBAR_ITEMS_SETTING_KEY],
            detail[HIDDEN_SIDEBAR_SECTIONS_SETTING_KEY]
          )
        );
      }
      if (HIDDEN_SIDEBAR_SECTIONS_SETTING_KEY in detail) {
        setHiddenSidebarSections(
          normalizeHiddenSidebarSections(detail[HIDDEN_SIDEBAR_SECTIONS_SETTING_KEY])
        );
      }
      if (HIDDEN_SIDEBAR_GROUP_LABELS_SETTING_KEY in detail) {
        setHiddenSidebarGroupLabels(
          normalizeHiddenSidebarGroupLabels(detail[HIDDEN_SIDEBAR_GROUP_LABELS_SETTING_KEY])
        );
      }
      if (SIDEBAR_SECTION_ORDER_KEY in detail && Array.isArray(detail[SIDEBAR_SECTION_ORDER_KEY])) {
        setSidebarSectionOrder(migrateSidebarSectionIds(detail[SIDEBAR_SECTION_ORDER_KEY]));
      }
      if (
        SIDEBAR_ITEM_ORDER_KEY in detail &&
        detail[SIDEBAR_ITEM_ORDER_KEY] &&
        typeof detail[SIDEBAR_ITEM_ORDER_KEY] === "object"
      ) {
        setSidebarItemOrder(migrateSidebarItemOrder(detail[SIDEBAR_ITEM_ORDER_KEY]));
      }
      if ("instanceName" in detail) setCustomAppName((detail.instanceName as string) || null);
      if ("customLogoBase64" in detail) {
        setCustomLogo((detail.customLogoBase64 as string) || null);
      } else if ("customLogoUrl" in detail) {
        setCustomLogo((detail.customLogoUrl as string) || null);
      }
    };

    window.addEventListener(SIDEBAR_SETTINGS_UPDATED_EVENT, handleSettingsUpdated as EventListener);
    return () =>
      window.removeEventListener(
        SIDEBAR_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated as EventListener
      );
  }, []);

  const getSidebarLabel = (key: string, fallback: string) =>
    typeof t.has === "function" && t.has(key) ? t(key) : fallback;

  const resolveItem = (item: SidebarItemDefinition, hidden: Set<string>) => {
    if (hidden.has(item.id)) return null;
    if (!isSidebarItemVisibleForFlags(item, featureFlags)) return null;
    const subtitle = item.subtitleKey
      ? getSidebarLabel(item.subtitleKey, item.subtitleFallback ?? "")
      : item.subtitleFallback;
    return {
      ...item,
      label: getSidebarLabel(item.i18nKey, item.labelFallback ?? item.id),
      subtitle: subtitle || undefined,
    };
  };

  const hiddenSidebarSet = new Set(hiddenSidebarItems);
  const hiddenSidebarGroupLabelsSet = new Set(hiddenSidebarGroupLabels);

  const runtimeSections = resolveRuntimeSidebarSections(SIDEBAR_SECTIONS, { radarAdminUrl });
  const orderedSections = applySectionOrder(
    runtimeSections.filter((section) => section.visibility !== "debug" || showDebug),
    sidebarSectionOrder
  );

  const visibleSections = orderedSections
    .map((section) => {
      const orderedChildren = applyItemOrder(
        section.children,
        sidebarItemOrder[section.id as SidebarSectionId] ?? []
      );

      const children = orderedChildren
        .map((child) => {
          if ("type" in child && child.type === "group") {
            const items = child.items
              .map((item) => resolveItem(item, hiddenSidebarSet))
              .filter(Boolean) as (SidebarItemDefinition & { label: string })[];
            if (items.length === 0) return null;
            // Smart-grouping: single visible item → inline flat (no group header)
            if (items.length === 1) return items[0];
            return {
              ...child,
              title: getSidebarLabel(child.titleKey, child.titleFallback),
              separatorHidden: hiddenSidebarGroupLabelsSet.has(child.id),
              items,
            } as SidebarItemGroup & {
              title: string;
              separatorHidden: boolean;
              items: (SidebarItemDefinition & { label: string })[];
            };
          }
          return resolveItem(child as SidebarItemDefinition, hiddenSidebarSet);
        })
        .filter(Boolean);

      return {
        ...section,
        title: getSidebarLabel(section.titleKey, section.titleFallback),
        children,
      };
    })
    .filter((section) => {
      const allItems = section.children.flatMap((child: any) =>
        child.type === "group" ? child.items : [child]
      );
      return allItems.length > 0;
    });

  const allVisibleItems = visibleSections.flatMap((section) =>
    section.children.flatMap((child: any) => (child.type === "group" ? child.items : [child]))
  );

  const pinnedItemList = Array.from(pinnedItems)
    .map((id) => allVisibleItems.find((item) => item.id === id))
    .filter(Boolean) as (SidebarItemDefinition & { label: string; subtitle?: string })[];

  // Pinned items lead the navigation (v2 has no separate Home section to follow).
  const insertIndex = 0;
  // Same element type as visibleSections so the union keeps `showTitle` and the
  // other resolved-section fields the renderer reads below.
  const pinnedSection: (typeof visibleSections)[number] = {
    id: "pinned" as SidebarSectionId,
    titleKey: "pinnedSection",
    titleFallback: "Pinned",
    title: getSidebarLabel("pinnedSection", "Pinned"),
    children: pinnedItemList,
  };
  const sectionsWithPinned =
    pinnedItemList.length > 0
      ? [
          ...visibleSections.slice(0, insertIndex),
          pinnedSection,
          ...visibleSections.slice(insertIndex),
        ]
      : visibleSections;

  const activeHref = getActiveSidebarHref(pathname, allVisibleItems);

  const isSearching = searchQuery.trim().length > 0;
  // Section master toggle: hidden sections drop out of the normal display,
  // but stay searchable — mirroring hidden items (#15508).
  const hiddenSectionSet = new Set<SidebarSectionId>(hiddenSidebarSections);
  const displaySections = isSearching
    ? filterSidebarSectionsByQuery(sectionsWithPinned, searchQuery)
    : sectionsWithPinned.filter((s) => !hiddenSectionSet.has(s.id));

  // Keep the active page visible while preserving accordion semantics for
  // unpinned sections. Render-time adjustment (react.dev "You Might Not Need
  // an Effect"): the composite key mirrors the old effect's
  // [activeHref, collapsed, pinnedSections, sidebarExpansionLoaded] deps.
  const activeExpansionKey = `${collapsed}|${sidebarExpansionLoaded}|${activeHref ?? ""}|${[
    ...pinnedSections,
  ]
    .sort()
    .join(",")}`;
  const [prevActiveExpansionKey, setPrevActiveExpansionKey] = useState<string | null>(null);
  if (activeExpansionKey !== prevActiveExpansionKey) {
    setPrevActiveExpansionKey(activeExpansionKey);
    if (!collapsed && sidebarExpansionLoaded) {
      if (skipInitialActiveExpansion) {
        setSkipInitialActiveExpansion(false);
      } else {
        for (const section of visibleSections) {
          const sectionItems = section.children.flatMap((child: any) =>
            child.type === "group" ? child.items : [child]
          );
          if (sectionItems.some((item: any) => !item.external && item.href === activeHref)) {
            setExpandedSections((prev) => {
              const next = expandActiveSection(pinnedSections, section.id as SidebarSectionId);
              if ([...next].every((id) => prev.has(id)) && next.size === prev.size) return prev;
              return next;
            });
            break;
          }
        }
      }
    }
  }

  // Persist the expanded-section set whenever it changes after hydration —
  // single writer replacing the saveToStorage calls that used to run inside
  // setState updaters (side effects belong outside updaters).
  useEffect(() => {
    if (!sidebarExpansionLoaded) return;
    saveToStorage(EXPANDED_SECTIONS_KEY, [...expandedSections]);
  }, [expandedSections, sidebarExpansionLoaded]);

  // Accordion toggle: opening a section closes all non-pinned sections
  const toggleSection = useCallback(
    (sectionId: SidebarSectionId) => {
      if (sectionId === "pinned") {
        setPinnedSectionCollapsed((prev) => !prev);
        return;
      }
      setExpandedSections((prev) => toggleExpandedSection(prev, pinnedSections, sectionId));
    },
    [pinnedSections]
  );

  const togglePin = useCallback((sectionId: SidebarSectionId) => {
    setPinnedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
        // Ensure the section is expanded when pinned
        setExpandedSections((prevExp) => {
          if (prevExp.has(sectionId)) return prevExp;
          const nextExp = new Set(prevExp);
          nextExp.add(sectionId);
          return nextExp;
        });
      }
      saveToStorage(PINNED_SECTIONS_KEY, [...next]);
      return next;
    });
  }, []);

  const togglePinItem = useCallback((itemId: string) => {
    setPinnedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      saveToStorage(PINNED_ITEMS_KEY, [...next]);
      return next;
    });
  }, []);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/shutdown", { method: "POST" });
    } catch {
      // Expected to fail as server shuts down
    }
    setIsShuttingDown(false);
    setShowShutdownModal(false);
    setIsDisconnected(true);
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await fetch("/api/restart", { method: "POST" });
    } catch {
      // Expected to fail as server restarts
    }
    setIsRestarting(false);
    setShowRestartModal(false);
    setIsDisconnected(true);
    setTimeout(() => globalThis.location.reload(), 3000);
  };

  const renderNavLink = (item: any, keyPrefix?: string) => {
    const active = !item.external && activeHref === item.href;
    const isItemPinned = pinnedItems.has(item.id);
    const itemKey = keyPrefix ? `${keyPrefix}-${item.href}` : item.href;
    const showPin = !collapsed && item.id !== "home";
    // Sidebar v2 rows are one line (label only); the subtitle stays in the tooltip and in search.
    const title = item.subtitle ? `${item.label} — ${item.subtitle}` : item.label;
    const content = (
      <>
        <Icon name={item.icon} size={16} />
        {/* Icon rail: the label lives in the tooltip/aria-label. (The kit hides non-svg children
            when collapsed, but this span's `flex` utility would out-rank that rule.) */}
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center">
            <span className={cn("truncate text-[13.5px]", active ? "font-medium" : "font-normal")}>
              {item.label}
            </span>
          </span>
        )}
      </>
    );
    const linkClassName = cn(showPin && "pe-8");

    return (
      <SidebarMenuItem key={itemKey} className="group/nav-item relative">
        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
          {item.external ? (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.label}
              title={title}
              className={linkClassName}
            >
              {content}
            </a>
          ) : (
            <Link
              href={item.href}
              prefetch={false}
              aria-label={item.label}
              title={title}
              className={linkClassName}
            >
              {content}
            </Link>
          )}
        </SidebarMenuButton>
        {showPin && (
          // kit-exception: Native button on kit tokens (track F): the pin overlays the kit SidebarMenuButton
          // (absolute, hover-revealed); the kit has no SidebarMenuAction slot.
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePinItem(item.id);
            }}
            title={isItemPinned ? t("unpinItem") : t("pinItem")}
            aria-label={isItemPinned ? t("unpinItem") : t("pinItem")}
            className={cn(
              "absolute end-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-control transition-opacity focus-visible:opacity-100",
              isItemPinned ? "text-text-main" : "text-text-muted",
              !isItemPinned && "opacity-0 group-hover/nav-item:opacity-100"
            )}
          >
            <Icon name="push_pin" size={13} fill={isItemPinned} />
          </button>
        )}
      </SidebarMenuItem>
    );
  };

  const renderGroupChild = (child: any, sectionId: string) => {
    const keyPrefix = sectionId === "pinned" ? "pinned" : undefined;
    if (child.type !== "group") return renderNavLink(child, keyPrefix);
    if (child.items.length === 0) return null;
    const separatorHidden = child.separatorHidden === true;
    const groupExpanded =
      separatorHidden ||
      isSearching ||
      (expandedGroups[child.id] ?? child.items.some((item) => item.href === activeHref));
    return (
      <SidebarMenuItem key={child.id} className="mt-1">
        {!separatorHidden && (
          // kit-exception: Native disclosure button on kit tokens (track F): full-width subgroup header row.
          <button
            type="button"
            aria-expanded={groupExpanded}
            aria-controls={`${navigationId}-${child.id}`}
            onClick={() =>
              setExpandedGroups((previous) => ({
                ...previous,
                [child.id]: !groupExpanded,
              }))
            }
            className="flex h-[30px] w-full items-center justify-between gap-2 rounded-control px-[11px] text-start text-[13px] font-normal text-text-muted hover:text-text-main"
          >
            <span className="truncate">{child.title}</span>
            <Icon
              name="chevron_right"
              size={14}
              className={cn("transition-transform", groupExpanded && "rotate-90")}
            />
          </button>
        )}
        {groupExpanded && (
          <SidebarMenu
            id={`${navigationId}-${child.id}`}
            className={cn(!separatorHidden && "ms-3 border-s border-border ps-2")}
          >
            {child.items.map((item: any) => renderNavLink(item, keyPrefix))}
          </SidebarMenu>
        )}
      </SidebarMenuItem>
    );
  };

  const brandName = customAppName || APP_CONFIG.name;

  return (
    <>
      {/* The skip link lives in DashboardShell, before the sidebar: below the mobile breakpoint
          this aside exists only inside the closed Sheet. */}
      <SidebarHeader className="r67-sidebar-header">
        <div className={cn("flex h-full items-center gap-2", collapsed && "justify-center")}>
          <Link
            href="/home"
            prefetch={false}
            aria-label={brandName}
            title={`${brandName} v${APP_CONFIG.version}`}
            className={cn(
              "flex min-w-0 items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-4",
              collapsed ? "justify-center" : "flex-1"
            )}
          >
            {collapsed ? (
              customLogo ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator-supplied white-label logo (data: or remote URL), not a static/known asset
                <img src={customLogo} alt="" className="size-6 object-contain" />
              ) : (
                <OmniRouteLogo size={22} />
              )
            ) : (
              <OmniRouteLockup
                name={customAppName}
                logoSrc={customLogo}
                className="max-w-full flex-nowrap whitespace-nowrap"
              />
            )}
          </Link>
          {!collapsed && (
            <span className="ms-auto shrink-0 rounded-[6px] border border-border bg-bg px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-text-muted">
              v{APP_CONFIG.version}
            </span>
          )}
          {/* The shell Header owns the collapse/expand trigger (one per page). Only the mobile
              drawer needs its own control: the modal Sheet hides the header while it is open. */}
          {isMobile && (
            <SidebarTrigger
              aria-label={tc("close")}
              title={tc("close")}
              className={cn("shrink-0", isMacElectron && "ms-auto")}
            >
              <Icon name="close" />
            </SidebarTrigger>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        {/* Search at the top of the content (spec §3.7), sticky: SidebarContent is the scroll
            container, so the box stays in view while the 100+ items scroll under it. */}
        {!collapsed && (
          // -top-2 / -mt-2 pt-2 cover the content's 8 px top padding, so scrolled rows do not
          // peek through a strip above the box.
          <div className="sticky -top-2 z-10 -mt-2 bg-[var(--ci-sidebar-bg)] pt-2 pb-1">
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tc("search")}
              aria-label={tc("search")}
              icon="search"
              className="gap-0"
              inputClassName="min-h-[34px] py-1.5 text-[13px]"
            />
          </div>
        )}
        {/* scroll-mt-14 (≈ the sticky search box) keeps a focused row clear of it on Shift+Tab. */}
        <nav
          aria-label={t("mainNavigation")}
          className="flex flex-col gap-3.5 [&_a]:scroll-mt-14 [&_button]:scroll-mt-14"
        >
          {isSearching && displaySections.length === 0 && (
            <p className="px-2 py-3 text-xs text-text-muted">{tc("noResults")}</p>
          )}
          {displaySections.map((section, idx) => {
            const sectionId = section.id as SidebarSectionId;
            const isExpanded =
              isSearching ||
              (sectionId === "pinned" ? !pinnedSectionCollapsed : expandedSections.has(sectionId));
            const isPinned = pinnedSections.has(sectionId);
            const isFirst = idx === 0;
            const sectionItems = section.children.flatMap((child: any) =>
              child.type === "group" ? child.items : [child]
            );
            const keyPrefix = section.id === "pinned" ? "pinned" : undefined;

            // Collapsed (icon rail): flat items, a separator between sections.
            if (collapsed) {
              return (
                <Fragment key={section.id}>
                  {!isFirst && <SidebarSeparator />}
                  <SidebarMenu>
                    {sectionItems.map((item: any) => renderNavLink(item, keyPrefix))}
                  </SidebarMenu>
                </Fragment>
              );
            }

            // Sections without a visible title (e.g. Home) render their items directly.
            if (section.showTitle === false) {
              return (
                <SidebarGroup key={section.id}>
                  <SidebarMenu>
                    {sectionItems.map((item: any) => renderNavLink(item, keyPrefix))}
                  </SidebarMenu>
                </SidebarGroup>
              );
            }

            return (
              <SidebarGroup key={section.id}>
                <SidebarGroupLabel className="group/header h-auto gap-1 px-0 normal-case">
                  {/* kit-exception: Native disclosure button on kit tokens (track F): a full-width section header
                      inside the kit SidebarGroupLabel (the kit Button is a fixed-height pill). */}
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionId)}
                    aria-expanded={isExpanded}
                    aria-controls={`${navigationId}-${section.id}`}
                    className="flex min-h-7 min-w-0 flex-1 items-center justify-between gap-2 rounded-control px-2.5 text-start text-[11px] font-medium tracking-[0.04em] uppercase text-text-muted hover:text-text-main"
                  >
                    <span className="truncate">{section.title}</span>
                    {/* The chevron only shows on hover / focus: v2 sections read as flat labels. */}
                    <Icon
                      name="expand_more"
                      size={14}
                      className={cn(
                        "opacity-0 transition group-hover/header:opacity-100 group-focus-within/header:opacity-100",
                        isExpanded && "rotate-180",
                        !isExpanded && "opacity-100"
                      )}
                    />
                  </button>
                  {sectionId !== "pinned" && (
                    // kit-exception: Native button on kit tokens (track F): a hover-revealed pin inside the kit
                    // SidebarGroupLabel; the kit has no SidebarGroupAction slot.
                    <button
                      type="button"
                      onClick={() => togglePin(sectionId)}
                      aria-label={`${isPinned ? t("unpinSection") : t("pinSectionOpen")}: ${section.title}`}
                      aria-pressed={isPinned}
                      title={isPinned ? t("unpinSection") : t("pinSectionOpen")}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-control transition-opacity hover:text-text-main focus-visible:opacity-100",
                        // v2 sections start pinned, so the pin is hover-revealed in both states.
                        isPinned ? "text-text-main" : "text-text-muted",
                        "opacity-0 group-hover/header:opacity-100 group-focus-within/header:opacity-100"
                      )}
                    >
                      <Icon name="push_pin" size={14} fill={isPinned} />
                    </button>
                  )}
                </SidebarGroupLabel>

                {isExpanded && (
                  <SidebarGroupContent id={`${navigationId}-${section.id}`}>
                    <SidebarMenu>
                      {section.children.map((child: any) => renderGroupChild(child, section.id))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                )}
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>

      <SidebarFooter
        style={{
          paddingBottom: isMacElectron ? "calc(0.5rem + var(--desktop-safe-bottom))" : undefined,
        }}
      >
        {!isE2EMode && <CloudSyncStatus collapsed={collapsed} />}
        {/* One full-width row per action: side by side, "Shutdown" truncated at the 16 rem width
            (and longer locales truncate both). */}
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon="restart_alt"
            onClick={() => setShowRestartModal(true)}
            title={t("restart")}
            aria-label={t("restart")}
            className={cn("w-full", collapsed ? "px-0" : "justify-start")}
          >
            {!collapsed && t("restart")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="power_settings_new"
            onClick={() => setShowShutdownModal(true)}
            title={t("shutdown")}
            aria-label={t("shutdown")}
            className={cn("w-full hover:text-error", collapsed ? "px-0" : "justify-start")}
          >
            {!collapsed && t("shutdown")}
          </Button>
        </div>
      </SidebarFooter>

      {/* The kit rail straddles the outer edge (right: -0.25rem), which overflows the clipped aside
          (scrollWidth > clientWidth): keep it inside, on the edge that faces the content. `right-0`
          is that edge in LTR; under dir=rtl globals.css mirrors it to `inset-inline-end: 0` (the
          aside's left = content edge, the aside itself kept on the right by DashboardShell's
          `rtl:order-none`). */}
      <SidebarRail className="right-0" />

      <ConfirmModal
        isOpen={showShutdownModal}
        onClose={() => setShowShutdownModal(false)}
        onConfirm={handleShutdown}
        title={t("shutdown")}
        message={t("shutdownConfirm")}
        confirmText={t("shutdown")}
        cancelText={tc("cancel")}
        variant="danger"
        loading={isShuttingDown}
      />

      <ConfirmModal
        isOpen={showRestartModal}
        onClose={() => setShowRestartModal(false)}
        onConfirm={handleRestart}
        title={t("restart")}
        message={t("restartConfirm")}
        confirmText={t("restart")}
        cancelText={tc("cancel")}
        variant="warning"
        loading={isRestarting}
      />

      {/* Blocking notice after shutdown: a kit dialog (focus trap, aria-modal) that cannot be
          dismissed — Escape and the overlay are no-ops, reloading is the only way out. */}
      <Modal
        isOpen={isDisconnected}
        onClose={() => {}}
        title={t("serverDisconnected")}
        closeOnOverlay={false}
        showCloseButton={false}
        size="sm"
      >
        <div className="text-center">
          <div className="flex items-center justify-center size-16 rounded-full bg-error-bg text-error mx-auto mb-4">
            <Icon name="power_off" size={32} />
          </div>
          <p className="text-text-muted mb-6">{t("serverDisconnectedMsg")}</p>
          <Button variant="secondary" onClick={() => globalThis.location.reload()}>
            {t("reloadPage")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
