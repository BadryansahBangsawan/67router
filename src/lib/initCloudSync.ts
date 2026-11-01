import initializeCloudSync from "@/shared/services/initializeCloudSync";
import { startModelSyncScheduler } from "@/shared/services/modelSyncScheduler";
import { isAutomatedTestProcess } from "@/shared/utils/testProcess";
import { getJobRegistry } from "@/lib/jobRegistry";
import { registerTokenHealthCheck } from "@/lib/jobs/tokenHealthCheckJob";
import { registerLogExportJob } from "@/lib/jobs/logExportJob";
import { backfillVolcPlanAutoSync } from "@/lib/providers/volcPlanAutoSyncBackfill";

// Initialize runtime background sync services once per server process.
let initialized = false;

export function shouldSkipCloudSyncInitialization(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): boolean {
  if (env.NEXT_PHASE === "phase-production-build") {
    return true;
  }

  const raw = env.OMNIROUTE_DISABLE_BACKGROUND_SERVICES;
  if (raw && new Set(["1", "true", "yes", "on"]).has(raw.trim().toLowerCase())) {
    return true;
  }

  return isAutomatedTestProcess(argv, env) && env.OMNIROUTE_ENABLE_RUNTIME_BACKGROUND_TASKS !== "1";
}

export async function ensureCloudSyncInitialized() {
  if (shouldSkipCloudSyncInitialization()) {
    return false;
  }
  if (!initialized) {
    try {
      await initializeCloudSync();
      await backfillVolcPlanAutoSync();
      startModelSyncScheduler();

      // startAll() runs each interval job's first tick synchronously, so it has to
      // come after initializeCloudSync(). The health check's first sweep used to sit
      // behind a 10s timer; awaiting the init is a firmer guarantee than the timer was.
      const registry = getJobRegistry();
      registerTokenHealthCheck(registry);
      registerLogExportJob(registry);
      await registry.startAll();

      initialized = true;
    } catch (error) {
      console.error("[ServerInit] Error initializing background sync services:", error);
    }
  }
  return initialized;
}

export default ensureCloudSyncInitialized;
