"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/shared/components/Icon";

type ConceptKey = "search" | "scrape" | "compare" | "auto";

interface ConceptItem {
  icon: string;
  key: ConceptKey;
  titleKey:
    "searchConceptTitle" | "scrapeConceptTitle" | "compareConceptTitle" | "autoConceptTitle";
  descKey: "searchConceptDesc" | "scrapeConceptDesc" | "compareConceptDesc" | "autoConceptDesc";
}

const CONCEPTS: ConceptItem[] = [
  { icon: "search", key: "search", titleKey: "searchConceptTitle", descKey: "searchConceptDesc" },
  {
    icon: "description",
    key: "scrape",
    titleKey: "scrapeConceptTitle",
    descKey: "scrapeConceptDesc",
  },
  {
    icon: "balance",
    key: "compare",
    titleKey: "compareConceptTitle",
    descKey: "compareConceptDesc",
  },
  { icon: "bolt", key: "auto", titleKey: "autoConceptTitle", descKey: "autoConceptDesc" },
];

interface SearchConceptCardProps {
  /** If true, the card starts collapsed. Default: false (expanded). */
  defaultCollapsed?: boolean;
}

export default function SearchConceptCard({ defaultCollapsed = false }: SearchConceptCardProps) {
  const t = useTranslations("search");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className="bg-surface border border-border rounded-lg overflow-hidden"
      data-testid="search-concept-card"
    >
      {/* Header */}
      {/* kit-exception: Full-width disclosure header (label + chevron across the card): the kit Button is a
          centred single-line pill, so the header stays a native <button> on kit tokens. */}
      <button
        type="button"
        className="flex justify-between items-center w-full px-4 py-2.5 bg-bg-alt border-b border-border hover:bg-bg-subtle transition-colors"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-controls="concept-card-content"
      >
        <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.04em] flex items-center gap-2">
          <span>ⓘ</span>
          <span>{t("modalitiesGuide")}</span>
        </span>
        <span className="text-text-muted text-xs" aria-hidden="true">
          {collapsed ? "▶" : "▼"}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div
          id="concept-card-content"
          className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="concept-card-content"
        >
          {CONCEPTS.map((c) => (
            <div
              key={c.key}
              className="flex gap-3 p-3 bg-bg-alt rounded-lg border border-border"
              data-testid={`concept-item-${c.key}`}
            >
              <Icon name={c.icon} size={20} className="text-text-muted" />
              <div>
                <div className="text-xs font-semibold text-text-main mb-0.5">{t(c.titleKey)}</div>
                <div className="text-[11px] text-text-muted leading-relaxed">{t(c.descKey)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
