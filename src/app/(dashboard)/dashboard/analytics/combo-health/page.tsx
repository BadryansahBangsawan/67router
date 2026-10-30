"use client";

import AnalyticsSubpage from "../components/AnalyticsSubpage";
import ComboHealthTab from "../ComboHealthTab";

export default function AnalyticsComboHealthPage() {
  return (
    <AnalyticsSubpage titleKey="analyticsComboHealth" subtitleKey="analyticsComboHealthSubtitle">
      <ComboHealthTab />
    </AnalyticsSubpage>
  );
}
