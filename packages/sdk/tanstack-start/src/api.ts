/**
 * `@inth/tanstack-start/api` same-origin consent routes.
 *
 * Mount one splat server route and both endpoints exist:
 *
 * ```ts
 * // src/routes/api/inth/$.ts
 * import { createFileRoute } from '@tanstack/react-router';
 * import { createConsentRoute } from '@inth/tanstack-start/api';
 *
 * export const Route = createFileRoute('/api/inth/$')({
 *   server: { handlers: createConsentRoute() },
 * });
 * ```
 *
 * - `GET /api/inth/manifest` passes the cached backend manifest through
 *   with its cache headers, so browsers and CDNs can cache it.
 * - `GET /api/inth/init` resolves init in-process from that manifest for
 *   the request's geo, language, and GPC signal. Pass
 *   `routePrefix: '/api/inth'` to `createConsentStateHandler()` to use it;
 *   a client language switch re-hits it.
 *
 * The backend URL and the policy snapshot default to what
 * `consentManifest()` provides. By default `POST /subjects` is not
 * proxied: consent saves go straight to the backend, which mirrors the
 * Next.js and Nuxt adapters. Pass `proxy: true` to forward the remaining
 * consent paths through the same route, and `proxy: true` to
 * `createConsentStateHandler()` as well; see
 * {@link ConsentRouteOptions.proxy}.
 */
import {
	projectUrl as generatedProjectUrl,
	snapshot as generatedSnapshot,
} from '@inth/sdk/generated';
import type { ConsentMode } from '@inth/sdk/modes';
import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	createConsentRouteHandler,
	createConsentRouteMethodHandlers,
	normalizeRoutePrefix,
	resolveServerMode,
} from '@inth/sdk/server';
import type {
	ConsentProxyOptions,
	ConsentRouteFetchGvl,
	ConsentRouteMethodHandlersFor,
	ConsentRouteRequestContext,
	ManifestCache,
} from '@inth/sdk/server';

import { handledRequestFor } from './libs/handled-request';
import {
	readConsentInputs,
	rememberConsentRouteRequest,
} from './libs/request-inputs';

export type { ConsentProxyOptions } from '@inth/sdk/server';

/** Options for {@link createConsentRoute}. */
export interface ConsentRouteOptions {
	/**
	 * The `mode` given to `createConsentStateHandler()`, so the route reads
	 * the manifest where the render does: a `manifest()` mode's `snapshot`
	 * or `manifestUrl` (unless that URL is this route's own), and no build
	 * snapshot for `source: 'runtime'` or an absolute `manifestUrl`.
	 *
	 * @default manifest()
	 */
	mode?: ConsentMode;

	/**
	 * Where this route is mounted, the same `routePrefix` given to
	 * `createConsentStateHandler()`. A mode's `manifestUrl` on it is the
	 * browser's way here, not a manifest to read.
	 *
	 * @default '/api/inth'
	 */
	routePrefix?: string;

	/**
	 * Backend base URL that serves `/manifest`, for example
	 * `https://your-project.inth.app`. Defaults to the URL
	 * `consentManifest()` read from `VITE_INTH_PROJECT_URL`. The proxy forwards to it.
	 */
	projectUrl?: string;

	/**
	 * Full manifest URL. Overrides `${projectUrl}/manifest` and the mode's.
	 */
	manifestUrl?: string;
	/**
	 * Deployment-bound manifest. Takes precedence over upstream URLs.
	 * Defaults to the mode's `snapshot`, then the one `consentManifest()`
	 * fetched during the build. `undefined`, which a build that could not
	 * fetch the manifest produces, makes the server fetch the policy at
	 * runtime.
	 */
	snapshot?: ConsentManifest | undefined;

	/**
	 * Fetch implementation for manifest and GVL requests. Defaults to
	 * `globalThis.fetch`.
	 */
	fetch?: typeof globalThis.fetch;

	/**
	 * Custom Global Vendor List fetcher. Called only when the manifest
	 * enables IAB and the resolved policy is the IAB model.
	 */
	fetchGvl?: ConsentRouteFetchGvl;

	/**
	 * Manifest cache to read through. Defaults to the module-level cache
	 * shared with `resolveConsent()`.
	 */
	cache?: ManifestCache;

	/**
	 * Receives the promise of a background manifest revalidation started by
	 * this request, so the host can keep it alive past the response on
	 * runtimes that stop detached work once a response is sent (a platform
	 * `waitUntil`, for example). The promise never rejects. Not called when
	 * the manifest is fresh or the request itself waits on the upstream.
	 */
	onBackgroundRevalidate?: (revalidation: Promise<void>) => void;

	/**
	 * Resolve a relative `projectUrl` or `manifestUrl` against the
	 * request's `x-forwarded-host` and `x-forwarded-proto` instead of
	 * `request.url`. Off by default: those headers are client-controlled
	 * unless a trusted proxy strips them, and with the proxy enabled a
	 * forged one would redirect consent saves. Turn it on only behind such
	 * a proxy.
	 *
	 * @default false
	 */
	trustForwardedHeaders?: boolean;

	/**
	 * Forward consent traffic to `projectUrl` through this route, so the
	 * browser only ever talks to the app's own origin, the way a Next.js
	 * app uses a `next.config` rewrite. Pass `proxy: true` to
	 * `createConsentStateHandler()` too, so the browser sends its saves
	 * here.
	 *
	 * When enabled the handlers gain `POST`, `PATCH`, `PUT`, `DELETE`, and
	 * `OPTIONS`, and `GET` falls through to the proxy for every path other
	 * than `manifest` and `init`, which stay resolved in-process. Only an
	 * allowlist of paths is forwarded (`subjects`, `subjects/:id`, `init`,
	 * `manifest`, `health`, `status`, plus {@link ConsentProxyOptions.paths});
	 * anything else is a 404, so the route is never an open proxy.
	 *
	 * The proxy forwards the browser's identity headers (`user-agent`,
	 * `accept-language`, `origin`, `referer`, `sec-gpc`, the geo headers),
	 * cookies only when {@link ConsentProxyOptions.cookieNames} names them,
	 * the client IP chain in `x-forwarded-for` only under
	 * `trustForwardedHeaders` (a client-controlled chain would let a visitor
	 * choose the address the backend sees), and adds
	 * `x-forwarded-host`, `x-forwarded-proto`, the Inth version header, and
	 * `x-inth-proxy: @inth/tanstack-start`. The hosted backend sits behind
	 * Vercel Firewall or Cloudflare, and a bare server-to-server fetch (server
	 * TLS fingerprint, no user agent, one egress IP for every visitor) scores
	 * as a bot. Forwarding those headers gives the WAF the same signals a
	 * direct browser request would carry, and `x-inth-proxy` plus the version
	 * header give the platform a stable key for a firewall bypass rule.
	 *
	 * Operational note: Vercel Attack Challenge Mode and Cloudflare Super Bot
	 * Fight Mode still block the proxied `POST /subjects` unless the consent
	 * paths are exempted, because a server cannot solve a browser challenge.
	 *
	 * @defaultValue false
	 */
	proxy?: boolean | ConsentProxyOptions;
}

/**
 * The argument TanStack Start passes to a server route handler. Only the
 * fields the consent handlers read are declared, so plain objects work in
 * tests.
 */
export interface ConsentRouteHandlerContext {
	request: Request;
	params?: { _splat?: string };
}

/** A server route handler compatible with `server.handlers.GET`. */
export type ConsentRouteHandler = (
	context: ConsentRouteHandlerContext
) => Promise<Response>;

/**
 * Handlers returned by {@link createConsentRoute}: `GET`, plus `POST`,
 * `PATCH`, `PUT`, `DELETE` and `OPTIONS` when `proxy` is set to anything
 * truthy.
 */
export type ConsentRouteHandlersFor<Options extends ConsentRouteOptions> =
	ConsentRouteMethodHandlersFor<Options, ConsentRouteHandler>;

/**
 * Creates the handlers for the same-origin consent route,
 * `src/routes/api/inth/$.ts`. The splat names the consent path.
 *
 * @param options - Mode, backend, snapshot, fetch, GVL, cache, and proxy
 * options. The backend URL and snapshot default to what
 * `consentManifest()` provides.
 * @returns Handlers for `createFileRoute('/api/inth/$')({ server: { handlers } })`.
 * With `proxy` off the set is `GET`; with it on, `POST`, `PATCH`, `PUT`,
 * `DELETE` and `OPTIONS` join. Manifest and init requests fail when there
 * is no snapshot, backend URL or `manifestUrl`. Proxy writes need a
 * backend URL.
 * @example
 * ```ts
 * export const Route = createFileRoute('/api/inth/$')({
 *   server: { handlers: createConsentRoute() },
 * });
 * ```
 * @example
 * ```ts
 * // Saves go through the route too. Pass `proxy: true` and the same
 * // `routePrefix` to createConsentStateHandler().
 * export const Route = createFileRoute('/api/inth/$')({
 *   server: { handlers: createConsentRoute({ proxy: true }) },
 * });
 * ```
 */
export const createConsentRoute = function createConsentRoute<
	Options extends ConsentRouteOptions = ConsentRouteOptions,
>(options?: Options): ConsentRouteHandlersFor<Options> {
	const resolved: ConsentRouteOptions = options ?? {};
	const source = resolveServerMode({
		adapter: '@inth/tanstack-start',
		buildSnapshot:
			'snapshot' in resolved ? resolved.snapshot : generatedSnapshot,
		mode: resolved.mode,
		projectUrl: resolved.projectUrl ?? generatedProjectUrl,
		routePrefix:
			resolved.routePrefix === undefined
				? undefined
				: normalizeRoutePrefix('@inth/tanstack-start', resolved.routePrefix),
	}).route;
	const handle = createConsentRouteHandler({
		...source,
		adapter: '@inth/tanstack-start',
		cache: resolved.cache,
		fetch: resolved.fetch,
		fetchGvl: resolved.fetchGvl,
		manifestUrl: resolved.manifestUrl ?? source.manifestUrl,
		proxy: resolved.proxy,
		trustForwardedHeaders: resolved.trustForwardedHeaders,
	});

	/**
	 * The request as core sees it: the router's `_splat` (absent in tests
	 * and custom mounts, where the last path segment decides), and the
	 * inputs the request middleware already resolved, so the init route
	 * agrees with the render. The handler may hold a copy of the request, so
	 * both are keyed on the Start request. The route renders no page, so it
	 * also tells the middleware to send its response as it is.
	 */
	const contextFor = async function contextFor(
		{ params, request }: ConsentRouteHandlerContext,
		route?: ConsentRouteRequestContext['route']
	): Promise<ConsentRouteRequestContext> {
		const handled = await handledRequestFor(request);
		rememberConsentRouteRequest(handled);
		return {
			inputs: readConsentInputs(handled),
			path: params?._splat,
			route,
			waitUntil: resolved.onBackgroundRevalidate,
		};
	};

	return createConsentRouteMethodHandlers<Options, ConsentRouteHandler>(
		resolved.proxy,
		(route) => async (context) =>
			handle(context.request, await contextFor(context, route))
	);
};
