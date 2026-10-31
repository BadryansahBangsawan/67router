import { getDbInstance, pingDb } from "@/lib/db/core";

interface ProviderStatusRow {
  id: string;
  provider: string;
  is_active: number | boolean | null;
  test_status: string | null;
  last_error: string | null;
}

function readProviderStatusRows(): ProviderStatusRow[] {
  const db = getDbInstance();
  return db
    .prepare<ProviderStatusRow>(
      "SELECT id, provider, is_active, test_status, last_error FROM provider_connections"
    )
    .all();
}

export async function buildOmniRouteStatus() {
  const [connections, circuitModule, quotaMonitorModule] = await Promise.all([
    Promise.resolve(readProviderStatusRows()),
    import("@/shared/utils/circuitBreaker").catch(() => null),
    import("../../open-sse/services/quotaMonitor").catch(() => null),
  ]);
  const circuitStatuses = circuitModule?.getAllCircuitBreakerStatuses() ?? null;
  const quotaSummary = quotaMonitorModule?.getQuotaMonitorSummary() ?? null;
  const active = connections.filter(
    (connection) => connection.is_active !== 0 && connection.is_active !== false
  );
  const disabled = connections.filter(
    (connection) => connection.is_active === 0 || connection.is_active === false
  );
  const healthy = active.filter((connection) => connection.test_status === "active");

  return {
    gateway: pingDb() ? "healthy" : "degraded",
    catalog: { available: true },
    providers: {
      configured: connections.length,
      active: active.length,
      healthy: healthy.length,
      disabled: disabled.length,
      connections: connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        active: connection.is_active !== 0 && connection.is_active !== false,
        health:
          connection.is_active === 0 || connection.is_active === false
            ? "disabled"
            : connection.test_status === "active"
              ? "healthy"
              : "unknown",
        failureState: connection.last_error ? "recent_error" : "none",
      })),
    },
    quotaMonitoring: {
      authoritative: quotaSummary?.active ?? 0,
      headerBased: 0,
      configured: 0,
      unsupported: quotaSummary ? Math.max(0, active.length - quotaSummary.active) : null,
      status: quotaSummary?.active ? "partial" : "unknown",
    },
    circuits: circuitStatuses
      ? {
          open: circuitStatuses.filter((c) => c.state === "OPEN").length,
          halfOpen: circuitStatuses.filter((c) => c.state === "HALF_OPEN").length,
          closed: circuitStatuses.filter((c) => c.state === "CLOSED").length,
          source: "persisted circuit breaker registry",
        }
      : { status: "unknown", source: "resilience subsystem unavailable" },
    usage: { source: "usage_history and call_logs", liveRequestsExecuted: false },
    budgets: { source: "internal governance limits", upstreamQuotaClaims: false },
  };
}
