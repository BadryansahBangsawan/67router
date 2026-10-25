/**
 * Base-URL resolution for /v1/search — the trust decision, on its own.
 *
 * The two override sources are NOT equally trusted, and reading them through
 * one call is what produced GHSA-3f8g-pfh9-j687:
 *
 *   - `providerSpecificData` is the stored provider connection
 *     (`credentials?.providerSpecificData`) — OPERATOR config. Honored under
 *     block-metadata, so a self-hosted SearXNG on loopback/LAN keeps working
 *     while cloud metadata (IMDS credential theft) stays rejected (GHSA-j7j4).
 *   - `providerOptions` is `body.provider_options` — CALLER input. Honored only
 *     by a provider that is keyless AND opted in via
 *     `allowClientBaseUrlOverride`. A keyed builder attaches the OPERATOR's key
 *     to whatever host this resolves to (`key=`/`api_key=` in the query for
 *     google-pse/searchapi, `X-API-Key`/`Authorization` for
 *     you.com/linkup/nimble/ollama), so a caller-chosen host would collect it —
 *     and a block-metadata check does nothing about that, because the attacker
 *     simply names their own public host.
 *
 * A caller override must also name a PUBLIC host: it is checked public-only
 * here, and the request itself goes out public-only + DNS-pinned with no
 * redirects (see `usesCallerSearchBaseUrl` and searchProxy.ts). A self-hosted
 * SearXNG on loopback/LAN is configured on the provider connection instead.
 *
 * Full coverage: tests/unit/search-baseurl-client-override-3f8g.test.ts,
 * tests/unit/search-caller-baseurl-public-only.test.ts.
 */

import {
  parseAndValidateNonMetadataUrl,
  parseAndValidatePublicUrl,
} from "@/shared/network/outboundUrlGuard";
import type { SearchProviderConfig } from "../../config/searchRegistry.ts";

interface BaseUrlParams {
  providerOptions?: Record<string, unknown>;
  providerSpecificData?: Record<string, unknown>;
}

/** Read one string setting from a SINGLE source, so callers can distinguish trust. */
function readSetting(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Refusal for a caller-supplied `provider_options.baseUrl` (GHSA-3f8g-pfh9-j687). */
export class SearchBaseUrlOverrideError extends Error {
  readonly code = "SEARCH_BASE_URL_OVERRIDE_REFUSED";
  constructor(providerId: string) {
    super(
      `provider_options.baseUrl is not accepted for search provider "${providerId}". ` +
        `Set the base URL on the provider connection instead.`
    );
    this.name = "SearchBaseUrlOverrideError";
  }
}

export function resolveSearchBaseUrl(config: SearchProviderConfig, params: BaseUrlParams): string {
  const operatorOverride = readSetting(params.providerSpecificData, "baseUrl");
  if (operatorOverride) {
    parseAndValidateNonMetadataUrl(operatorOverride);
    return operatorOverride.replace(/\/+$/, "");
  }

  const callerOverride = readSetting(params.providerOptions, "baseUrl");
  if (callerOverride) {
    if (!config.allowClientBaseUrlOverride || config.authType === "apikey") {
      throw new SearchBaseUrlOverrideError(config.id);
    }
    parseAndValidatePublicUrl(callerOverride);
    return callerOverride.replace(/\/+$/, "");
  }

  return config.baseUrl.replace(/\/+$/, "");
}

/**
 * True when `resolveSearchBaseUrl` would return the CALLER's
 * `provider_options.baseUrl` (no operator override is set). Such a target is
 * untrusted and must be fetched public-only, DNS-pinned, without redirects.
 */
export function usesCallerSearchBaseUrl(
  config: SearchProviderConfig,
  params: BaseUrlParams
): boolean {
  return (
    config.allowClientBaseUrlOverride === true &&
    config.authType !== "apikey" &&
    !readSetting(params.providerSpecificData, "baseUrl") &&
    !!readSetting(params.providerOptions, "baseUrl")
  );
}
