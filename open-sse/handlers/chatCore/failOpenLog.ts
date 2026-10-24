/**
 * Logging for chatCore steps that are deliberately fail-open (a failure must not
 * break the request) but must never be silent (Hard Rule #6). The error text goes
 * through sanitizeErrorMessage(), and logging itself can never throw.
 */
import { sanitizeErrorMessage } from "../../utils/error.ts";

export type FailOpenLogger =
  | { warn?: (tag: string, message: string, meta?: Record<string, unknown>) => unknown }
  | null
  | undefined;

export function logFailOpenError(
  log: FailOpenLogger,
  tag: string,
  stage: string,
  err: unknown,
  context: Record<string, unknown> = {}
): void {
  try {
    log?.warn?.(tag, `${stage} failed (continuing): ${sanitizeErrorMessage(err)}`, {
      stage,
      ...context,
    });
  } catch {
    // no-effect: a broken logger must not turn a fail-open step into a request failure
  }
}
