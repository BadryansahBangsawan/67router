"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

const BODY_PADDING = { none: "", sm: "p-4", md: "p-5" } as const;

/**
 * 67router settings section: a 16/600 `<h2>` with an optional muted description and header
 * action ABOVE one bordered card that holds the controls. Without a `title` it is just the
 * bordered card (used for single-toggle sections such as Debug mode).
 *
 * `className` lands on the card body — the element that holds the children — so a caller
 * swapping a legacy `<Card className="flex flex-col gap-4">` keeps its inner layout unchanged.
 * Pure layout: no state, no handlers.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
  padding = "md",
  className,
  ...props
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Header-right slot (buttons, badges, a section-level toggle). */
  action?: ReactNode;
  children?: ReactNode;
  padding?: keyof typeof BODY_PADDING;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "title" | "children" | "className">) {
  const headingId = useId();
  const hasHeader = title != null || description != null || action != null;
  return (
    <section
      data-slot="settings-section"
      aria-labelledby={title != null ? headingId : undefined}
      className="flex min-w-0 flex-col gap-3"
      {...props}
    >
      {hasHeader && (
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            {title != null && (
              <h2
                id={headingId}
                className="text-[16px] font-semibold leading-6 tracking-[-0.01em] text-text-main"
              >
                {title}
              </h2>
            )}
            {description != null && (
              <p className="mt-0.5 text-[13px] leading-5 text-text-muted">{description}</p>
            )}
          </div>
          {action != null && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children != null && (
        <div
          data-slot="settings-section-card"
          className={cn(
            "min-w-0 rounded-card border border-border bg-surface",
            BODY_PADDING[padding] ?? BODY_PADDING.md,
            className
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * One settings row: label + optional muted description on the left, the control on the right.
 * Consecutive rows are split by a hairline; the first row drops its rule and top padding and
 * the last its bottom padding, so rows sit flush inside a padded SettingsSection card.
 */
export function SettingsRow({
  label,
  description,
  control,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** The right-hand control (Toggle, Select, Button…). */
  control?: ReactNode;
  /** Extra content shown under the label/description (e.g. a revealed sub-field). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="settings-row"
      className={cn(
        "flex min-w-0 flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0",
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-main">{label}</p>
          {description != null && (
            <p className="mt-0.5 text-[13px] leading-5 text-text-muted">{description}</p>
          )}
        </div>
        {control != null && <div className="flex shrink-0 items-center">{control}</div>}
      </div>
      {children}
    </div>
  );
}
