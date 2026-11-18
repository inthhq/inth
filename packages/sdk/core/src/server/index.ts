/**
 * `@inth/sdk/server` — server-only helpers shared by host framework layers.
 *
 * Nothing here touches the DOM or the kernel. The consent route handler
 * (`createConsentRouteHandler`) answers `/manifest` and `/init` for every
 * host integration (Next.js, Nuxt, SvelteKit, Astro, TanStack Start), and
 * `resolveRequestConsent` / `readRequestConsent` resolve the consent state a
 * server render hands the client, and `fetchCachedManifest` is the one
 * process cache for the backend's manifest. Resolving `/init` from a
 * manifest, which imports every translation, is at
 * `@inth/sdk/transports/manifest-cache`.
 *
 * Each export is its own module, so a bundle that imports only
 * `resolveRequestProjectUrl` does not pull in the init resolver.
 */
export type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
} from './consent-proxy';
export type {
	ConsentInitReport,
	ConsentRouteFetchGvl,
	ConsentRouteHandler,
	ConsentRouteHandlerOptions,
	ConsentRouteName,
	ConsentRouteRequestContext,
} from './consent-route';
export {
	CONSENT_ROUTE_TIMEOUT_HEADER,
	createConsentRouteHandler,
	readRequestForwarding,
	readWaitUntil,
} from './consent-route';
export type {
	ConsentRequestFacts,
	RequestConsentMode,
	RequestConsentRead,
	RequestConsentState,
	ResolveRequestConsentOptions,
} from './request-consent';
export {
	readRequestConsent,
	resolveRenderBudgetMs,
	resolveRequestConsent,
} from './request-consent';
export type { FetchCachedGvlOptions } from './gvl-cache';
export { clearGvlCache, fetchCachedGvl } from './gvl-cache';
export type {
	CachedManifestResponse,
	FetchCachedManifestOptions,
	ManifestCache,
	ManifestCacheOptions,
	ManifestFetch,
	ManifestSourceOptions,
	ManifestUnavailableReason,
} from '../libs/manifest-cache-runtime';
export {
	clearManifestCache,
	createManifestCache,
	createManifestRequestUrl,
	fetchCachedManifest,
	getManifestSMaxAge,
	getManifestStaleWhileRevalidate,
	MANIFEST_DEDUPE_TTL_SECONDS,
	MANIFEST_PASSTHROUGH_HEADERS,
	ManifestUnavailableError,
	resolveManifestSourceUrl,
} from '../libs/manifest-cache-runtime';
export type {
	ConsentProxyRouteMethodHandlers,
	ConsentRouteMethodHandlers,
	ConsentRouteMethodHandlersFor,
} from './route-handlers';
export {
	createConsentRouteHandlerCache,
	createConsentRouteMethodHandlers,
} from './route-handlers';
export { normalizeRoutePrefix } from './route-prefix';
export type {
	ServerMode,
	ServerModeInput,
	ServerModeOptions,
} from './server-mode';
export {
	buildSnapshotSkipReason,
	needsBuildSnapshot,
	readModeData,
	resolveServerMode,
} from './server-mode';
export type { ConsentInputHeaderTarget } from './shared';
export {
	DEFAULT_CONSENT_ROUTE_PREFIX,
	IN_PROCESS_ORIGIN,
	SAFE_NONCE,
	trimPathSlashes,
	writeConsentInputHeaders,
} from './shared';
export {
	createStaticManifestModule,
	loadStaticManifest,
} from './static-manifest';
export type { StaticManifestModuleOptions } from './static-manifest';
export type {
	RequestHeaderSource,
	ResolveRequestOriginOptions,
} from './request-origin';
export {
	resolveRequestProjectUrl,
	resolveRequestOrigin,
} from './request-origin';
