/**
 * Categorical series colours for the analytics charts and legends — the kit's five chart
 * tokens (`--color-chart-1..5` → `--ci-chart-*`, flipped by the theme), then the same five
 * mixed toward the surface so series 6–10 stay distinguishable without a hex palette.
 * Works in inline `style` and as SVG `fill`/`stroke` values (recharts).
 * 67router order: primary (near-black / near-white), then the greys, the green chart token
 * last — it reads as "healthy", so it should not be the second series of a breakdown.
 */
const BASE = [1, 2, 3, 5, 4].map((n) => `var(--color-chart-${n})`);

export const PROVIDER_COLORS = [
  ...BASE,
  ...BASE.map((color) => `color-mix(in oklab, ${color} 55%, var(--color-text-muted))`),
];

export function getSeriesColor(index: number): string {
  return PROVIDER_COLORS[index % PROVIDER_COLORS.length];
}

/** Semantic series used by the token/cost charts. */
export const CHART_SERIES = {
  input: "var(--color-chart-1)",
  output: "var(--color-chart-2)",
  cost: "var(--color-chart-3)",
} as const;
