/**
 * Shared upstream-error extraction for the combo dispatch paths
 * (executeTargetAttempt.ts and roundRobinCombo.ts). Reads a clone of the failed
 * response so the original stays consumable by the caller.
 */
import {
  logRetryHintUnreadable,
  parseRetryAfterHeader,
  readProseRetryAfter,
} from "../../utils/error.ts";
import type { ComboErrorBody, ComboRetryAfter } from "./types.ts";

export type ComboErrorInfo = {
  errorText: string;
  errorBody: ComboErrorBody;
  bodyText: string;
  retryAfter: ComboRetryAfter | null;
};

type RetryHintLog = Parameters<typeof logRetryHintUnreadable>[0];

export async function extractComboErrorInfo(
  result: Response,
  ctx?: { log?: RetryHintLog; tag?: string; modelStr?: string }
): Promise<ComboErrorInfo> {
  const reportUnreadable = (reason: "unparseable body" | "clone failed") => {
    if (!ctx?.log) return;
    logRetryHintUnreadable(ctx.log, ctx.tag || "COMBO", ctx.modelStr || "", result.status, reason);
  };

  let errorText = result.statusText || "";
  let errorBody: ComboErrorBody = null;
  let retryAfter: ComboRetryAfter | null = null;
  let bodyText = "";
  try {
    const cloned = result.clone();
    try {
      const text = await cloned.text();
      bodyText = text;
      if (text) {
        errorText = text.substring(0, 500);
        errorBody = JSON.parse(text);
        const parsedError = errorBody?.error;
        errorText =
          (typeof parsedError === "object" && parsedError?.message) ||
          (typeof parsedError === "string" ? parsedError : null) ||
          errorBody?.message ||
          errorText;
        // Nested retry hints (live incident 1784457764961-73): reset_at (ISO,
        // buildErrorBody) is unambiguous and preferred; retry_after is ISO from
        // buildModelCooldownBody but integer SECONDS from buildErrorBody — coerce
        // a number to an instant before it can out-race an ISO sibling in the
        // earliest-retryAfter comparison. reset_seconds is the last resort.
        const nestedError = typeof parsedError === "object" ? parsedError : null;
        const nestedRetryAfterRaw = nestedError?.retry_after ?? null;
        const nestedResetSeconds = nestedError?.reset_seconds ?? null;
        retryAfter =
          errorBody?.retryAfter ||
          nestedError?.reset_at ||
          (typeof nestedRetryAfterRaw === "number" && nestedRetryAfterRaw > 0
            ? new Date(Date.now() + nestedRetryAfterRaw * 1000).toISOString()
            : nestedRetryAfterRaw) ||
          (typeof nestedResetSeconds === "number" && nestedResetSeconds > 0
            ? new Date(Date.now() + nestedResetSeconds * 1000).toISOString()
            : null);
      }
    } catch {
      // no-effect: non-JSON error body keeps the raw text; logged at debug
      reportUnreadable("unparseable body");
    }
  } catch {
    // no-effect: body already consumed; no retry hint available, logged at warn
    reportUnreadable("clone failed");
  }
  retryAfter ||= readProseRetryAfter(bodyText); // #13672 opt-in prose retry hints
  retryAfter ||= parseRetryAfterHeader(result.headers); // header-only shapes (quota-reset-timing)

  return { errorText, errorBody, bodyText, retryAfter };
}
