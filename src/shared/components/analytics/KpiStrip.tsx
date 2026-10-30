"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

const COLUMNS = {
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
} as const;

/**
 * 67router KPI row: ONE bordered card split into equal cells by hairline dividers (instead of a
 * row of separate cards). Every cell draws its own left + top rule; the grid is pulled up/left by
 * one pixel inside the clipped card, so the first column and first row lose theirs and the
 * dividers stay correct whatever the column count is at the current breakpoint.
 */
export function KpiStrip({
  children,
  columns = 4,
  className,
  ...props
}: {
  children: ReactNode;
  columns?: keyof typeof COLUMNS;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div
      className={cn("overflow-hidden rounded-card border border-border bg-surface", className)}
      {...props}
    >
      <div
        className={cn(
          "-ml-px -mt-px grid",
          "[&>*]:border-l [&>*]:border-t [&>*]:border-border",
          COLUMNS[columns]
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One KPI cell: 13 px muted label, 28/600 tabular value, optional 12.5 px footnote. */
export function KpiCell({
  label,
  value,
  footnote,
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  footnote?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 px-5 py-4", className)}>
      <span className="truncate text-[13px] text-text-muted">{label}</span>
      <span
        className={cn(
          "truncate text-[28px] font-semibold leading-9 tracking-[-0.03em] tabular-nums text-text-main",
          valueClassName
        )}
      >
        {value}
      </span>
      {footnote != null && (
        <span className="truncate text-[12.5px] text-text-muted">{footnote}</span>
      )}
    </div>
  );
}
