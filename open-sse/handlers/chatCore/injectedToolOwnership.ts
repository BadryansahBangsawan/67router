function getToolName(tool: unknown): string {
  if (!tool || typeof tool !== "object") return "";
  const r = tool as Record<string, unknown>;
  if (typeof r.name === "string") return r.name;
  if (r.function && typeof r.function === "object") {
    const fn = r.function as Record<string, unknown>;
    if (typeof fn.name === "string") return fn.name;
  }
  return "";
}

/** Sort tools by name so the cacheable prompt prefix is stable across turns. */
export function sortToolsByName<T>(tools: T[]): T[] {
  if (!Array.isArray(tools) || tools.length <= 1) return tools;
  return [...tools].sort((a, b) => getToolName(a).localeCompare(getToolName(b)));
}

/**
 * Owner id for server-executed builtin tools: the API key id when it is a non-empty
 * string, otherwise null (the tool loop falls back to "local").
 */
export function resolveToolOwnerId(apiKeyInfo: Record<string, unknown> | null): string | null {
  const rawId = apiKeyInfo?.id;
  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return rawId;
  }
  return null;
}

interface FallbackPlan {
  enabled: boolean;
  toolName: string | null;
  convertedToolCount: number;
}

/**
 * Pure helper: merge web-search/web-fetch fallback tool names into the
 * builtin owner set. Adds a name only when plan.enabled===true,
 * plan.convertedToolCount>0, plan.toolName is non-null, and that name
 * did not already exist in the pre-conversion client tools (builtinToolNames)
 * OR in the original client tool names captured before fallback injection.
 * Does not mutate its input; returns a new result.
 */
export function mergeInjectedFallbackOwnerNames(
  injectionResult: { builtinToolNames: string[] },
  plans: FallbackPlan[],
  preConversionClientToolNames?: string[]
): { builtinToolNames: string[] } {
  const existing = new Set(injectionResult.builtinToolNames);
  if (preConversionClientToolNames) {
    for (const name of preConversionClientToolNames) {
      existing.add(name);
    }
  }
  const extraNames: string[] = [];
  for (const plan of plans) {
    if (
      plan.enabled &&
      plan.convertedToolCount > 0 &&
      plan.toolName &&
      !existing.has(plan.toolName)
    ) {
      extraNames.push(plan.toolName);
      existing.add(plan.toolName);
    }
  }
  return { builtinToolNames: [...injectionResult.builtinToolNames, ...extraNames] };
}
