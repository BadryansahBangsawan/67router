"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@omniroute/ui-kit/page-header";
import CompressionPanel from "./CompressionPanel";
import CompressionStylesTile from "../CompressionStylesTile";

export default function CompressionSettingsPage() {
  const tSidebar = useTranslations("sidebar");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PageHeader
        compact
        title={tSidebar("contextSettings")}
        description={tSidebar("contextSettingsSubtitle")}
      />
      <CompressionPanel />
      {/* D0: read-only telemetry tile (output-token savings + applied styles) */}
      <CompressionStylesTile />
    </div>
  );
}
