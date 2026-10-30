/**
 * Public-boundary projection for server-executed tool results (builtin web_search /
 * web_fetch): error-like subtrees are sanitized before a result reaches the model or the
 * client, so upstream error details and stack traces never leak through a tool result.
 */
import {
  sanitizeErrorMessage,
  sanitizeUpstreamDetails,
} from "@omniroute/open-sse/utils/errorSanitization.ts";

const SKILL_FAILURE_DISCRIMINATORS = new Set(["error", "failed", "failure"]);

function isSkillErrorKey(key: string): boolean {
  const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();
  return (
    normalizedKey === "error" ||
    normalizedKey === "errors" ||
    normalizedKey === "warning" ||
    normalizedKey === "warnings"
  );
}

function isFailureDiscriminator(value: unknown): boolean {
  return typeof value === "string" && SKILL_FAILURE_DISCRIMINATORS.has(value.trim().toLowerCase());
}

function isSkillFailureOutput(output: Record<string, unknown>): boolean {
  try {
    const status = output.status;
    return (
      output.success === false ||
      (typeof status === "number" && Number.isFinite(status) && status >= 400) ||
      isFailureDiscriminator(status) ||
      isFailureDiscriminator(output.type) ||
      isFailureDiscriminator(output.event) ||
      isFailureDiscriminator(output.kind)
    );
  } catch {
    return true;
  }
}

type SensitiveSkillReferences = {
  objects: WeakSet<object>;
  strings: Set<string>;
};

function markSensitiveSkillReference(value: unknown, sensitive: SensitiveSkillReferences): void {
  if (typeof value === "string") {
    sensitive.strings.add(value);
    return;
  }
  if (!value || typeof value !== "object" || sensitive.objects.has(value)) return;

  sensitive.objects.add(value);
  try {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      markSensitiveSkillReference(entry, sensitive);
    }
  } catch {
    // A revoked proxy or throwing getter is unsafe to expose at the boundary.
  }
}

function collectSensitiveSkillReferences(
  value: unknown,
  sensitive: SensitiveSkillReferences,
  visited: WeakSet<object>
): void {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);

  try {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSkillErrorKey(key)) {
        markSensitiveSkillReference(entry, sensitive);
      } else {
        collectSensitiveSkillReferences(entry, sensitive, visited);
      }
    }
  } catch {
    markSensitiveSkillReference(value, sensitive);
  }
}

type SkillProjectionContext = {
  active: WeakSet<object>;
  projected: WeakMap<object, unknown>;
  sensitive: SensitiveSkillReferences;
};

function projectNestedSkillErrorSubtrees(value: unknown, context: SkillProjectionContext): unknown {
  if (typeof value === "string") {
    return context.sensitive.strings.has(value) ? sanitizeErrorMessage(value) : value;
  }
  if (!value || typeof value !== "object") return value;
  if (context.active.has(value)) return "[circular]";
  if (context.projected.has(value)) return context.projected.get(value);

  if (context.sensitive.objects.has(value)) {
    const safeValue = sanitizeUpstreamDetails(value);
    context.projected.set(value, safeValue);
    return safeValue;
  }

  context.active.add(value);
  if (Array.isArray(value)) {
    const projected: unknown[] = [];
    context.projected.set(value, projected);
    for (const entry of value) projected.push(projectNestedSkillErrorSubtrees(entry, context));
    context.active.delete(value);
    return projected;
  }

  const projected: Record<string, unknown> = {};
  context.projected.set(value, projected);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    projected[key] = isSkillErrorKey(key)
      ? sanitizeUpstreamDetails(entry)
      : projectNestedSkillErrorSubtrees(entry, context);
  }
  context.active.delete(value);
  return projected;
}

export function projectSkillOutputForBoundary(
  output: Record<string, unknown>
): Record<string, unknown> {
  try {
    if (isSkillFailureOutput(output)) {
      const projected = sanitizeUpstreamDetails(output);
      return projected && typeof projected === "object" && !Array.isArray(projected)
        ? (projected as Record<string, unknown>)
        : { success: false, error: "Skill execution failed" };
    }

    const sensitive: SensitiveSkillReferences = {
      objects: new WeakSet<object>(),
      strings: new Set<string>(),
    };
    collectSensitiveSkillReferences(output, sensitive, new WeakSet<object>());
    return projectNestedSkillErrorSubtrees(output, {
      active: new WeakSet<object>(),
      projected: new WeakMap<object, unknown>(),
      sensitive,
    }) as Record<string, unknown>;
  } catch {
    return { success: false, error: "Skill execution failed" };
  }
}
