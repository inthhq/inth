/**
 * `@inth/sdk/server` — server-only helpers shared by host framework layers.
 *
 * Nothing here touches the DOM or the kernel. The consent route handler
 * (`createConsentRouteHandler`) answers `/v1/consent/manifest` and `/v1/consent/init` for every
 * host integration (Next.js, Nuxt, SvelteKit, Astro, TanStack Start), and
 * `resolveRequestConsent` / `readRequestConsent` resolve the consent state a
 * server render hands the client, `fetchRequestInit` returns a hosted
 * `/v1/consent/init` answer as received, and `fetchCachedManifest` is the one
 * process cache for the backend's manifest. Resolving `/v1/consent/init` from a
 * manifest, which imports every translation, is at
 * `@inth/sdk/transports/manifest-cache`.
 *
 * Each export is its own module, so a bundle that imports only
 * `resolveRequestProjectUrl` does not pull in the init resolver.
 */
export type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
} from './consent-proxy.api';
export type {
	ConsentInitReport,
	ConsentRouteFetchGvl,
	ConsentRouteHandler,
	ConsentRouteHandlerOptions,
	ConsentRouteName,
	ConsentRouteRequestContext,
} from './consent-route.api';
export {
	CONSENT_ROUTE_TIMEOUT_HEADER,
	createConsentRouteHandler,
	readRequestForwarding,
	readWaitUntil,
} from './consent-route.api';
export type {
	ConsentRequestFacts,
	FetchRequestInitOptions,
	RequestConsentMode,
	RequestConsentRead,
	RequestConsentState,
	RequestInitAnswer,
	ResolveRequestConsentOptions,
} from './request-consent.api';
export {
	fetchRequestInit,
	readRequestConsent,
	resolveRenderBudgetMs,
	resolveRequestConsent,
} from './request-consent.api';
export type { FetchCachedGvlOptions } from './server-gvl-cache.api';
export { fetchServerGvl } from './server-gvl-cache.api';
export { clearGvlCache } from '../transports/gvl-cache.model';
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
	DEFAULT_RESOLVE_TIMEOUT_MS,
	createManifestRequestUrl,
	fetchCachedManifest,
	getManifestSMaxAge,
	getManifestStaleWhileRevalidate,
	MANIFEST_DEDUPE_TTL_SECONDS,
	MANIFEST_PASSTHROUGH_HEADERS,
	ManifestUnavailableError,
	resolveManifestSourceUrl,
	withResolutionBudget,
} from '../libs/manifest-cache-runtime';
export type {
	ConsentProxyRouteMethodHandlers,
	ConsentRouteMethodHandlers,
	ConsentRouteMethodHandlersFor,
} from './create-consent-route-method-handlers';
export {
	createConsentRouteHandlerCache,
	createConsentRouteMethodHandlers,
} from './create-consent-route-method-handlers';
export { normalizeRoutePrefix } from './normalize-route-prefix';
export type {
	ServerMode,
	ServerModeInput,
	ServerModeOptions,
} from './server-mode.model';
export {
	buildSnapshotSkipReason,
	needsBuildSnapshot,
	readModeData,
	resolveServerMode,
} from './server-mode.model';
export type { ConsentInputHeaderTarget } from './server-adapter.model';
export {
	DEFAULT_CONSENT_ROUTE_PREFIX,
	IN_PROCESS_ORIGIN,
	keepAlive,
	SAFE_NONCE,
	trimPathSlashes,
	writeConsentInputHeaders,
} from './server-adapter.model';
export {
	createStaticManifestEntry,
	createStaticManifestModule,
	loadStaticManifest,
} from './static-manifest.api';
export type {
	StaticManifestEntry,
	StaticManifestModuleOptions,
} from './static-manifest.api';
export type {
	RequestHeaderSource,
	ResolveRequestOriginOptions,
} from './request-origin.model';
export {
	resolveRequestProjectUrl,
	resolveRequestOrigin,
} from './request-origin.model';
export {
	canDeferEngine,
	engineNeededNow,
} from '../surface-actions/can-defer-engine';
export type { DeferEngineOptions } from '../surface-actions/can-defer-engine';
