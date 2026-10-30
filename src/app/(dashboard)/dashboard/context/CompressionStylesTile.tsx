"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Badge from "@/shared/components/Badge";
import { KpiCell, KpiStrip } from "@/shared/components/KpiStrip";

interface Summary {
  totalRuns: number;
  totalTokensSaved: number;
  runsWithStyles: number;
  bypassCount: number;
  totalOutputTokens: number;
  appliedStyleCounts: Record<string, number>;
}

const EMPTY: Summary = {
  totalRuns: 0,
  totalTokensSaved: 0,
  runsWithStyles: 0,
  bypassCount: 0,
  totalOutputTokens: 0,
  appliedStyleCounts: {},
};

export default function CompressionStylesTile() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [summary, setSummary] = useState<Summary>(EMPTY);

  useEffect(() => {
    fetch("/api/settings/compression/run-telemetry")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Summary | null) => {
        if (data) setSummary(data);
      })
      .catch(() => {});
  }, []);

  const styles = Object.entries(summary.appliedStyleCounts);

  return (
    <KpiStrip gridClassName="grid-cols-1" data-testid="compression-styles-tile">
      <div className="min-w-0">
        <KpiCell
          className="pb-0"
          label={t("compressionStylesTileTitle")}
          value={summary.totalTokensSaved.toLocaleString(locale, { useGrouping: false })}
          footnote={t("compressionStylesTileSummary", {
            tokens: summary.totalTokensSaved,
            runs: summary.runsWithStyles,
          })}
        />
        <div className="flex flex-wrap gap-1 px-5 pb-4 pt-2">
          {styles.length === 0 ? (
            <span className="text-xs text-text-muted">{t("compressionStylesTileEmpty")}</span>
          ) : (
            styles.map(([id, count]) => (
              <Badge key={id} size="sm" className="font-mono">
                {id} · {count}
              </Badge>
            ))
          )}
        </div>
      </div>
    </KpiStrip>
  );
}
