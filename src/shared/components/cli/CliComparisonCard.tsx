"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import Badge from "@/shared/components/Badge";
import Card from "@/shared/components/Card";
import { cn } from "@/shared/utils/cn";
import type { CliConceptType } from "./CliConceptCard";

export interface CliComparisonCardProps {
  currentType: CliConceptType;
}

const TYPE_HREFS: Record<CliConceptType, string> = {
  code: "/dashboard/cli-code",
  agent: "/dashboard/cli-agents",
  acp: "/dashboard/acp-agents",
};

export default function CliComparisonCard({ currentType }: CliComparisonCardProps) {
  const t = useTranslations("cliCommon");

  const types: CliConceptType[] = ["code", "agent", "acp"];

  return (
    <Card padding="sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {types.map((type) => {
          const isCurrent = type === currentType;
          return (
            <div
              key={type}
              data-current={isCurrent ? "true" : undefined}
              className={cn(
                "flex flex-col gap-2 rounded-control border p-3",
                isCurrent ? "border-border-strong bg-surface" : "border-border bg-bg-subtle"
              )}
            >
              {/* Title */}
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-[0.04em]",
                    isCurrent ? "text-text-main" : "text-text-muted"
                  )}
                >
                  {t(`comparison.${type}.title`)}
                </span>
                {isCurrent ? (
                  <Badge variant="primary" size="sm" className="whitespace-nowrap">
                    {t("comparison.thisPage")} ✓
                  </Badge>
                ) : (
                  <Link
                    href={TYPE_HREFS[type]}
                    className="inline-flex items-center whitespace-nowrap rounded-[5px] border border-border bg-surface px-1.5 py-px text-[11px] font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text-main"
                  >
                    {t("comparison.open")}
                  </Link>
                )}
              </div>

              {/* Description */}
              <p className="text-[11px] text-text-muted leading-relaxed">
                {t(`comparison.${type}.desc`)}
              </p>

              {/* Flow */}
              <p className="text-[10px] text-text-muted font-mono">
                {t(`comparison.${type}.flow`)}
              </p>

              {/* Examples */}
              <p className="text-[10px] text-text-muted italic">
                {t(`comparison.${type}.examples`)}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
