"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import Icon from "./Icon";

/**
 * Two-segment theme switch (sun / moon). Each segment sets its theme explicitly; the one that
 * matches the resolved theme is pressed. ("system" stays reachable from Settings → Appearance —
 * while it is active, the pressed segment follows the OS.)
 */
export default function ThemeToggle({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "card";
}) {
  const { setTheme, isDark } = useTheme();
  const t = useTranslations("header");
  const segments = [
    { theme: "light" as const, icon: "light_mode", label: t("switchToLightMode"), on: !isDark },
    { theme: "dark" as const, icon: "dark_mode", label: t("switchToDarkMode"), on: isDark },
  ];
  return (
    <div
      role="group"
      aria-label={t("themes")}
      className={cn(
        "r67-theme-toggle inline-flex items-center gap-0.5 rounded-control border border-border p-0.5",
        variant === "card" && "bg-surface",
        className
      )}
    >
      {segments.map((segment) => (
        // kit-exception: a two-segment icon switch; the kit SegmentedControl is a pill with text
        // items and a solid active fill, the design wants a 28×26 neutral chip.
        <button
          key={segment.theme}
          type="button"
          aria-label={segment.label}
          title={segment.label}
          aria-pressed={segment.on}
          onClick={() => setTheme(segment.theme)}
          className={cn(
            "flex h-[26px] w-7 items-center justify-center rounded-[6px] transition-colors",
            segment.on ? "bg-surface-2 text-text-main" : "text-text-muted hover:text-text-main"
          )}
        >
          <Icon name={segment.icon} size={14} />
        </button>
      ))}
    </div>
  );
}
