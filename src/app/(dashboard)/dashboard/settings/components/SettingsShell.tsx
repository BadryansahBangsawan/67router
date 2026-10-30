"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/utils/cn";
import { SIDEBAR_SECTIONS } from "@/shared/constants/sidebarVisibility/sections";
import type { SidebarItemDefinition } from "@/shared/constants/sidebarVisibility/types";

/** The settings pages, in sidebar order — read from the sidebar's own "configuration" group so
 *  the sub-nav and the main navigation can never disagree. */
export function getSettingsNavItems(): readonly SidebarItemDefinition[] {
  for (const section of SIDEBAR_SECTIONS) {
    for (const child of section.children) {
      if ("type" in child && child.type === "group" && child.id === "configuration") {
        return child.items;
      }
    }
  }
  return [];
}

export function isSettingsNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 67router settings layout: a 200 px sub-nav column on the left and a content column capped at
 * 760 px on the right. Rendered once by `settings/template.tsx`, so every settings page shares it
 * (the generated `settings/layout.tsx` stays untouched). On small screens the sub-nav becomes a
 * horizontally scrolling row above the content.
 */
export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const tSidebar = useTranslations("sidebar");
  const pathname = usePathname();
  const items = getSettingsNavItems();

  const label = (item: SidebarItemDefinition) =>
    item.labelFallback && typeof tSidebar.has === "function" && !tSidebar.has(item.i18nKey)
      ? item.labelFallback
      : tSidebar(item.i18nKey);

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-10">
      <nav
        aria-label={tSidebar("settings")}
        data-testid="settings-subnav"
        className="min-w-0 shrink-0 lg:sticky lg:top-0 lg:w-[200px] lg:self-start"
      >
        <p className="mb-2 hidden px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted lg:block">
          {tSidebar("settings")}
        </p>
        <ul className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {items.map((item) => {
            const active = isSettingsNavItemActive(pathname, item.href);
            return (
              <li key={item.id} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center whitespace-nowrap rounded-control px-2.5 text-[13.5px] transition-colors",
                    active
                      ? "bg-surface-2 font-medium text-text-main"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  {label(item)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 w-full max-w-[760px] flex-1">{children}</div>
    </div>
  );
}
