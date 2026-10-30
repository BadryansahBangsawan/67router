"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@omniroute/ui-kit/page-header";

/**
 * 67router page anatomy for the standalone analytics routes (analytics/<tab>): a page header
 * (26/600 title + muted subtitle, from the sidebar item's own label keys) above the tab body.
 */
export default function AnalyticsSubpage({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: string;
  subtitleKey: string;
  children: ReactNode;
}) {
  const tSidebar = useTranslations("sidebar");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader compact title={tSidebar(titleKey)} description={tSidebar(subtitleKey)} />
      {children}
    </div>
  );
}
