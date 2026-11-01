"use client";

import AnalyticsSubpage from "../components/AnalyticsSubpage";
import ProviderUtilizationTab from "../ProviderUtilizationTab";

export default function AnalyticsUtilizationPage() {
  return (
    <AnalyticsSubpage titleKey="analyticsUtilization" subtitleKey="analyticsUtilizationSubtitle">
      <ProviderUtilizationTab />
    </AnalyticsSubpage>
  );
}
