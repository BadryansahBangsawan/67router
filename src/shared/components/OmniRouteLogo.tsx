import { cn } from "@/shared/utils/cn";

type OmniRouteLogoProps = { size?: number; className?: string };

/** Wordmark of the product. White-label operators replace it through `OmniRouteLockup`. */
export const BRAND_WORDMARK = "67router";

/**
 * The 67router mark ("Route 67"): a 6 whose tail becomes the 7 — one stroke, drawn on a 256
 * viewBox. Same geometry as public/favicon.svg and public/apple-touch-icon.svg.
 */
export const BRAND_MARK_CIRCLE = { cx: 88, cy: 166, r: 46 } as const;
export const BRAND_MARK_PATH = "M55.5 133.5 L138 51 H214 L154 218";

/**
 * Product mark — inline SVG (basePath-safe, no asset fetch), stroked in `currentColor` so it
 * follows the surrounding ink in both themes. Keeps the historical `OmniRouteLogo` API
 * (`size`, `className`); only the artwork changed.
 */
export default function OmniRouteLogo({ size = 20, className = "" }: OmniRouteLogoProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      // Inline size too: a utility on a parent (e.g. `[&_svg]:size-4`) must not resize the mark.
      style={{ width: size, height: size }}
      aria-hidden="true"
      focusable="false"
      className={cn("r67-logo-mark shrink-0", className)}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={30}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx={BRAND_MARK_CIRCLE.cx} cy={BRAND_MARK_CIRCLE.cy} r={BRAND_MARK_CIRCLE.r} />
        <path d={BRAND_MARK_PATH} />
      </g>
    </svg>
  );
}

interface OmniRouteLockupProps {
  name?: string | null;
  logoSrc?: string | null;
  className?: string;
}

/** Mark + "67router" wordmark; white-label operators get their own name/logo instead. */
export function OmniRouteLockup({ name, logoSrc, className }: OmniRouteLockupProps) {
  if (name || logoSrc) {
    return (
      <span
        role="img"
        aria-label={name || BRAND_WORDMARK}
        className={cn("inline-flex items-center gap-2", className)}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- operator-supplied white-label logo (data: or remote URL), not a static/known asset
          <img src={logoSrc} alt="" className="size-6 object-contain" />
        ) : (
          <OmniRouteLogo size={22} />
        )}
        {name && (
          <span aria-hidden="true" className="truncate font-semibold">
            {name}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={BRAND_WORDMARK}
      className={cn("r67-lockup inline-flex items-center gap-2.5 text-text-main", className)}
    >
      <OmniRouteLogo size={22} />
      <span aria-hidden="true" className="text-base font-semibold tracking-[-0.02em]">
        {BRAND_WORDMARK}
      </span>
    </span>
  );
}
