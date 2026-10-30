/**
 * Canonical status colors as resolved HEX — the 67router status palette (light values).
 *
 * Use these ONLY where a CSS class or `var()` can't reach — canvas 2D, string/colour math, or
 * inline styles on third-party nodes. For normal DOM and ReactFlow strokes prefer the
 * theme-aware tokens (`text-success`, `var(--orch-status-*)`, …), which follow light/dark.
 *
 * Status semantics: green = healthy/active, amber = degraded/last-used, red = error, neutral
 * greys for idle/cooldown and the approval gate. Orange (`fallback`) is reserved for
 * fallback / recovered requests and is never a general accent.
 */
export const STATUS_HEX = {
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  muted: "#a3a3a3",
  /** Human-approval gate (waiting_approval) — the darker neutral, distinct from idle. */
  approval: "#737373",
  /** Fallback / recovered request only. */
  fallback: "#ff4f00",
} as const;
