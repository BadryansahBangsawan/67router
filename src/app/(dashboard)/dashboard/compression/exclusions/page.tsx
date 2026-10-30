"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@omniroute/ui-kit/page-header";
import ExclusionsPanel from "./ExclusionsPanel";

export default function CompressionExclusionsPage() {
  const tSidebar = useTranslations("sidebar");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <PageHeader
        compact
        title={tSidebar("compressionExclusions")}
        description={tSidebar("compressionExclusionsSubtitle")}
      />
      <ExclusionsPanel />
    </div>
  );
}
