import { cn } from "@/shared/utils/cn";

export type StatusDotTone = "success" | "warning" | "error" | "fallback" | "neutral";

const TONES: Record<StatusDotTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  // Orange is reserved for fallback / recovered semantics.
  fallback: "bg-fallback",
  // Neutral / cooldown: a hollow ring instead of a filled dot.
  neutral: "border-[1.5px] border-text-muted bg-transparent",
};

/** 67router status dot: the colour lives on the 8 px dot, the label stays in the text ink. */
export function StatusDot({
  tone,
  className,
  label,
}: {
  tone: StatusDotTone;
  className?: string;
  /** Accessible name when the dot is not next to a visible label. */
  label?: string;
}) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("inline-block size-2 shrink-0 rounded-full", TONES[tone], className)}
    />
  );
}
