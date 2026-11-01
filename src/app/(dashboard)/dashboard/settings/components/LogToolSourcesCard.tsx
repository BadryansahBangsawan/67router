"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/shared/components";
import { SettingsRow, SettingsSection } from "./SettingsSection";
import { useTranslations } from "next-intl";

export default function LogToolSourcesCard() {
  const [logToolSources, setLogToolSources] = useState(false);
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
          setLogToolSources(data.logToolSources === true);
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

  const updateLogToolSources = async (value: boolean) => {
    const previousValue = logToolSources;
    setLogToolSources(value);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logToolSources: value }),
      });
      if (!res.ok) setLogToolSources(previousValue);
    } catch (err) {
      setLogToolSources(previousValue);
      console.error("Failed to update logToolSources:", err);
    }
  };

  return (
    <SettingsSection>
      <SettingsRow
        label={t("logToolSourcesToggle")}
        description={t("logToolSourcesDescription")}
        control={
          <Toggle
            ariaLabel={t("logToolSourcesToggle")}
            checked={logToolSources}
            onChange={updateLogToolSources}
            disabled={loading}
          />
        }
      />
    </SettingsSection>
  );
}
