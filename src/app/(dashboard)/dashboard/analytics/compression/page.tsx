"use client";

import AnalyticsSubpage from "../components/AnalyticsSubpage";
import CompressionAnalyticsTab from "../CompressionAnalyticsTab";

export default function AnalyticsCompressionPage() {
  return (
    <AnalyticsSubpage titleKey="analyticsCompression" subtitleKey="analyticsCompressionSubtitle">
      <CompressionAnalyticsTab />
    </AnalyticsSubpage>
  );
}
