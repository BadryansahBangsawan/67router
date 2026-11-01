"use client";

import AnalyticsSubpage from "../components/AnalyticsSubpage";
import SearchAnalyticsTab from "../SearchAnalyticsTab";

export default function AnalyticsSearchPage() {
  return (
    <AnalyticsSubpage titleKey="analyticsSearch" subtitleKey="analyticsSearchSubtitle">
      <SearchAnalyticsTab />
    </AnalyticsSubpage>
  );
}
