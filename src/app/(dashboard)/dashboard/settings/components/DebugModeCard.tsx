"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/shared/components";
import { SettingsRow, SettingsSection } from "./SettingsSection";
import { useTranslations } from "next-intl";

export default function DebugModeCard() {
  const [debugMode, setDebugMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("settings");

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok && mounted) {
          const data = await res.json();
          setDebugMode(data.debugMode === true);
        }
      } catch {
        // Leave the current switch state in place if settings cannot be loaded.
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const updateDebugMode = async (value: boolean) => {
    const previousValue = debugMode;
    setDebugMode(value);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debugMode: value }),
      });
      if (!res.ok) setDebugMode(previousValue);
    } catch (err) {
      setDebugMode(previousValue);
      console.error("Failed to update debugMode:", err);
    }
  };

  return (
    <SettingsSection>
      <SettingsRow
        label={t("debugToggle")}
        control={
          <Toggle
            ariaLabel={t("debugToggle")}
            checked={debugMode}
            onChange={updateDebugMode}
            disabled={loading}
          />
        }
      />
    </SettingsSection>
  );
}
