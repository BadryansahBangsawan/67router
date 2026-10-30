"use client";

import AnalyticsSubpage from "../components/AnalyticsSubpage";
import EvalsTab from "../../usage/components/EvalsTab";

export default function AnalyticsEvalsPage() {
  return (
    <AnalyticsSubpage titleKey="analyticsEvals" subtitleKey="analyticsEvalsSubtitle">
      <EvalsTab />
    </AnalyticsSubpage>
  );
}
