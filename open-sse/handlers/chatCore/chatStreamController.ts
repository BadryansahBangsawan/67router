/**
 * chatCore client stream controller wiring (chatCore god-file decomposition, slice 2).
 *
 * Extracted byte-identically from handleChatCore: build the per-request stream controller used for
 * client-disconnect detection. Its disconnect handler first offers the event to the streaming
 * tail's finalizer, falls back to finalizing the pending-request scope as a 499
 * `client_disconnected`, then notifies the caller's onDisconnect — every step fail-safe. The two
 * late-bound handlers are installed by the streaming tail after the controller exists, so they are
 * read through getters at event time, exactly like the closure over the handler's `let` bindings.
 * finalizePendingScope (src/lib/usage) is injected so this engine leaf takes no new open-sse → src
 * import edge.
 */

import { STREAM_DISCONNECT_GRACE_PERIOD_MS } from "../../config/constants.ts";
import type { StreamControllerOptions } from "../../utils/streamControllerTypes.ts";
import { createStreamController } from "../../utils/streamHandler.ts";
import type { PipelineStreamErrorHandler } from "../../utils/streamFailureFinalization.ts";
import { logFailOpenError, type FailOpenLogger } from "./failOpenLog.ts";

type DisconnectEvent = Parameters<NonNullable<StreamControllerOptions["onDisconnect"]>>[0];

export function createChatStreamController<TScope>({
  getClientDisconnectFinalize,
  getPipelineStreamError,
  pendingScope,
  finalizePendingScope,
  onDisconnect,
  provider,
  model,
  connectionId,
  pendingRequestId,
  clientResponseFormat,
  clientAbortSignal,
  allowCompletedToolHandoffGrace,
  log,
}: {
  getClientDisconnectFinalize: () => ((event: DisconnectEvent) => boolean) | null;
  getPipelineStreamError: () => PipelineStreamErrorHandler | null;
  pendingScope: TScope;
  finalizePendingScope: (
    scope: TScope,
    metadata: { status: number; error: string; errorCode: string }
  ) => unknown;
  onDisconnect: ((event: DisconnectEvent) => unknown) | null | undefined;
  provider: string;
  model: string;
  connectionId: string | null | undefined;
  pendingRequestId: string;
  clientResponseFormat: string | null | undefined;
  clientAbortSignal: AbortSignal | null | undefined;
  allowCompletedToolHandoffGrace: boolean;
  log?: FailOpenLogger;
}) {
  // Every disconnect step stays fail-open, but a failure is logged (Hard Rule #6).
  const logStepFailure = (stage: string, err: unknown) =>
    logFailOpenError(log, "STREAM_DISCONNECT", stage, err, {
      provider,
      model,
      connectionId: connectionId ?? null,
      requestId: pendingRequestId,
    });
  return createStreamController({
    onDisconnect: (event) => {
      let finalized = false;
      try {
        finalized = getClientDisconnectFinalize()?.(event) === true;
      } catch (err) {
        logStepFailure("stream tail disconnect finalize", err);
      }
      if (!finalized) {
        try {
          finalizePendingScope(pendingScope, {
            status: 499,
            error: `Client disconnected: ${event.reason}`,
            errorCode: "client_disconnected",
          });
          finalized = true;
        } catch (err) {
          logStepFailure("pending scope finalize", err);
        }
      }
      try {
        onDisconnect?.(event);
      } catch (err) {
        logStepFailure("onDisconnect callback", err);
      }
      return finalized;
    },
    onError: (event) => getPipelineStreamError()?.(event),
    provider,
    model,
    connectionId,
    pendingRequestId,
    clientResponseFormat,
    clientAbortSignal,
    allowCompletedToolHandoffGrace,
    clientDisconnectGracePeriodMs: STREAM_DISCONNECT_GRACE_PERIOD_MS,
  });
}
