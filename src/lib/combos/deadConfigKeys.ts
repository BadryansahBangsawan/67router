/**
 * Combo config keys that are dead at runtime: no reader in open-sse or
 * src/lib, no default in comboConfig.ts, rejected history via migration 103.
 * evalRouting joined them when the Evals feature was removed (67router).
 * The 8 other v3.8.31-era keys (queueDepth, fallbackDelayMs, handoffProviders,
 * maxComboDepth, manifestRouting, complexityAwareRouting, pipeline_enabled,
 * shadowRouting) are still consumed at runtime — never add them here.
 */
export const DEAD_COMBO_CONFIG_KEYS: ReadonlyArray<string> = Object.freeze([
  "pipelineConcurrency",
  "resetAwareEnabled",
  "resetAwareWindow",
  "evalRouting",
]);

export function stripDeadComboConfigKeys<T>(rawConfig: T): T {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return rawConfig;
  }
  let mutated = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawConfig as Record<string, unknown>)) {
    if ((DEAD_COMBO_CONFIG_KEYS as ReadonlyArray<string>).includes(key)) {
      mutated = true;
      continue;
    }
    next[key] = value;
  }
  return (mutated ? next : rawConfig) as T;
}
