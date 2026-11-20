/**
 * The same-origin consent route for SvelteKit.
 *
 * A prerendered page carries no visitor's consent, so the browser resolves
 * it. With this route, it does so through the app's own origin: the route
 * resolves `/init` from the snapshot the build downloaded, and serves the
 * manifest for browser resolution. The routes themselves live in
 * `@inth/sdk/server` (`createConsentRouteHandler`), shared with the
 * Next.js, Nuxt, Astro and TanStack Start adapters; this module mounts them
 * as a SvelteKit `RequestHandler`. What it adds is SvelteKit's: the rest
 * parameter picks the route, `event.fetch` answers a relative backend
 * in-process, `event.getClientAddress()` and `event.url` vouch for the
 * proxy's hop chain, and `platform.context.waitUntil` keeps detached work
 * alive.
 */
import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	createConsentRouteHandlerCache,
	createConsentRouteMethodHandlers,
	readWaitUntil,
	trimPathSlashes,
} from '@inth/sdk/server';
import type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
	ConsentRouteFetchGvl,
	ConsentRouteHandler,
	ConsentRouteMethodHandlersFor,
	ConsentRouteName,
	ConsentRouteRequestContext,
	ManifestFetch,
} from '@inth/sdk/server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';

import { readLocals, readServerMode } from './load-consent';
import type { InthLocals } from './types';

export type { ConsentProxyOptions } from '@inth/sdk/server';

/**
 * Hands a promise to the `waitUntil` a SvelteKit adapter exposes on
 * `event.platform.context` (Netlify, and Cloudflare and Vercel edge on
 * SvelteKit 2), so a background refresh outlives the response on runtimes
 * that would cancel it. A no-op where the adapter provides none, which
 * includes SvelteKit 3's Cloudflare and Vercel adapters; apps there pass
 * the platform's `waitUntil` as `onBackgroundRevalidate`.
 */
export const waitUntilFromEvent = function waitUntilFromEvent(
	revalidation: Promise<void>,
	event: RequestEvent
): void {
	readWaitUntil(
		(event.platform as { context?: unknown } | undefined)?.context
	)?.(revalidation);
};

const REST_PARAM = /\[\.\.\.(?<name>[^\]=]+)(?:=[^\]]+)?\]/u;

/**
 * The path below the route's rest parameter (`[...path]` in
 * `src/routes/api/inth/[...path]/+server.ts`), or `undefined` when the route
 * has none.
 */
const readRestPath = function readRestPath(
	event: RequestEvent
): string | undefined {
	const name = REST_PARAM.exec(event.route?.id ?? '')?.groups?.name;
	const value = name ? event.params?.[name] : undefined;
	return value === undefined ? undefined : trimPathSlashes(value);
};

/**
 * Whether the handle's `projectUrl` names this route's own path, as
 * `inthHandle({ projectUrl: '/api/inth' })` does when saves go through the
 * proxy without `routePrefix`. The path is the request's, less the rest
 * parameter. Forwarding there would call the route itself. With
 * `routePrefix` set, the handle already dropped such a `projectUrl`.
 */
const projectUrlIsRoute = function projectUrlIsRoute(
	event: RequestEvent,
	{ projectUrl, routePrefix }: InthLocals
): boolean {
	if (routePrefix !== undefined || !projectUrl?.startsWith('/')) {
		return false;
	}
	const rest = readRestPath(event);
	const path = trimPathSlashes(event.url.pathname);
	const mount = rest ? path.slice(0, -(rest.length + 1)) : path;
	return trimPathSlashes(projectUrl) === mount;
};

/**
 * The proxy's hop chain, from what SvelteKit derived from its own
 * configuration (`ADDRESS_HEADER`, `XFF_DEPTH`, `paths.origin` or
 * SvelteKit 2's `ORIGIN`), never from the request's forwarding headers.
 * Without a configured origin, adapter-node takes the host from the `Host`
 * header, so the forwarded host is only as trustworthy as that.
 */
const readForwarding = function readForwarding(
	event: RequestEvent
): ConsentProxyForwarding {
	let clientAddress: string | undefined;
	try {
		clientAddress = event.getClientAddress();
	} catch {
		// Some adapters and test harnesses cannot tell.
	}
	return {
		for: clientAddress,
		host: event.url.host,
		proto: event.url.protocol.replace(/:$/u, ''),
	};
};

export interface ConsentRouteOptions {
	/**
	 * The Inth backend. Defaults to the handle's `projectUrl`, then the URL
	 * `consentManifest()` read from `PUBLIC_INTH_PROJECT_URL`. The manifest
	 * is read from `${projectUrl}/v1/consent/manifest` when there is no snapshot.
	 */
	projectUrl?: string;
	/**
	 * Full manifest URL. Takes precedence over `${projectUrl}/v1/consent/manifest`.
	 * Defaults to the `manifestUrl` of the handle's `manifest()` mode,
	 * unless that one is this route's own.
	 */
	manifestUrl?: string;
	/**
	 * A manifest to resolve with. Defaults to the handle's: the mode's
	 * `snapshot`, then `inthHandle({ snapshot })`, then the one
	 * `consentManifest()` downloaded. A mode that reads its manifest at
	 * runtime (`source: 'runtime'`, an absolute `manifestUrl`) uses none.
	 */
	snapshot?: ConsentManifest;
	/**
	 * Fetch implementation for an absolute `projectUrl` or `manifestUrl`.
	 * Defaults to the global `fetch`. A relative one, such as
	 * `/api/self-host`, goes through `event.fetch` instead.
	 */
	fetch?: ManifestFetch;
	/**
	 * Fetches the Global Vendor List when the resolved policy is IAB.
	 * Defaults to the shared server cache, with a deadline on the upstream
	 * request.
	 */
	fetchGvl?: ConsentRouteFetchGvl;
	/**
	 * Receives the promise of a background manifest revalidation started by
	 * this request, with the request event, so the host can keep it alive
	 * past the response on runtimes that stop detached work once a response
	 * is sent. Defaults to handing it to `event.platform.context.waitUntil`
	 * when the adapter provides one (Netlify, and Cloudflare and Vercel edge
	 * on SvelteKit 2); nothing is registered otherwise. SvelteKit 3's
	 * Cloudflare and Vercel adapters provide none, so pass the platform's
	 * `waitUntil` there. The promise never rejects. Not called when the
	 * manifest is fresh or the request itself waits on the upstream.
	 *
	 * @example
	 * ```ts
	 * import { waitUntil } from 'cloudflare:workers';
	 *
	 * export const { GET } = createConsentRoute({
	 *   onBackgroundRevalidate: (promise) => waitUntil(promise),
	 * });
	 * ```
	 */
	onBackgroundRevalidate?: (
		revalidation: Promise<void>,
		event: RequestEvent
	) => void;
	/**
	 * Forward consent writes to `projectUrl` through this route, so the
	 * browser only talks to this origin. Without it the route answers `GET`
	 * only and a save gets `405`.
	 *
	 * When enabled the route gains `POST`, `PATCH`, `PUT`, `DELETE`, and
	 * `OPTIONS`, and `GET` forwards every path below the route's rest
	 * parameter other than `manifest` and `init`, which stay resolved
	 * in-process. Only an allowlist of paths is forwarded (`subjects`,
	 * `subjects/:id`, `init`, `manifest`, `health`, `status`, plus
	 * {@link ConsentProxyOptions.paths}); anything else is a 404, so the
	 * route is never an open proxy.
	 *
	 * The proxy forwards the browser's identity headers (`user-agent`,
	 * `accept-language`, `origin`, `referer`, `sec-gpc`, the geo headers),
	 * cookies only when {@link ConsentProxyOptions.cookieNames} names them,
	 * and sets `x-forwarded-for` from `event.getClientAddress()`,
	 * `x-forwarded-host` and `x-forwarded-proto` from `event.url`, the Inth
	 * version header, and `x-inth-proxy: @inth/svelte`. The hosted backend
	 * sits behind a firewall that scores a bare server-to-server request as a
	 * bot; these give it the signals a direct browser request carries, and a
	 * stable key for a bypass rule. It needs `projectUrl`, not a
	 * `manifestUrl` alone. A path such as `/api/self-host` names a route in
	 * this app: requests to it go through `event.fetch`, which SvelteKit
	 * answers in-process, so the request's `Host` header never chooses
	 * where they go.
	 *
	 * @defaultValue false
	 */
	proxy?: boolean | ConsentProxyOptions;
}

/**
 * The route's handlers: `GET`, which serves `manifest` and `init`, plus
 * `POST`, `PATCH`, `PUT`, `DELETE` and `OPTIONS` when `proxy` is set to
 * anything truthy.
 */
export type ConsentRouteHandlersFor<Options extends ConsentRouteOptions> =
	ConsentRouteMethodHandlersFor<Options, RequestHandler>;

/**
 * Creates the catch-all consent route. Only prerendered pages need it: the
 * server resolves every other page in `loadConsent`.
 *
 * The route reads the snapshot, backend URL and mode `inthHandle()` was
 * given from `event.locals.inth`, so they are set once, on the handle, and
 * the route and `loadConsent` read the manifest from the same place.
 * Options passed here win.
 *
 * ```ts
 * // src/routes/api/inth/[...path]/+server.ts
 * import { createConsentRoute } from '@inth/svelte/kit';
 *
 * export const { GET } = createConsentRoute();
 * ```
 *
 * Then tell the browser where it is:
 *
 * ```ts
 * // src/hooks.server.ts
 * export const handle = inthHandle({ routePrefix: '/api/inth' });
 * ```
 *
 * With `proxy: true` the route also forwards consent writes to the
 * backend, and `inthHandle({ proxy: true, routePrefix })` points the
 * browser's saves at it:
 *
 * ```ts
 * export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } =
 *   createConsentRoute({ proxy: true });
 * ```
 *
 * @returns `GET`; with `proxy` on, `POST`, `PATCH`, `PUT`, `DELETE` and
 * `OPTIONS` join.
 */
export const createConsentRoute = function createConsentRoute<
	Options extends ConsentRouteOptions = ConsentRouteOptions,
>(routeOptions?: Options): ConsentRouteHandlersFor<Options> {
	const options: ConsentRouteOptions = routeOptions ?? {};
	// The handle passes the same values on every request, so the core
	// handler is built once and rebuilt only if they change.
	const cached = createConsentRouteHandlerCache();
	const handlerFor = function handlerFor(
		event: RequestEvent
	): ConsentRouteHandler {
		const locals = readLocals(event);
		const { route } = readServerMode(
			locals && projectUrlIsRoute(event, locals)
				? { ...locals, projectUrl: undefined }
				: locals
		);
		return cached({
			adapter: '@inth/svelte',
			fetch: options.fetch,
			fetchGvl: options.fetchGvl,
			manifest: options.snapshot ?? route.manifest,
			manifestUrl: options.manifestUrl ?? route.manifestUrl,
			projectUrl: options.projectUrl ?? route.projectUrl,
			proxy: options.proxy,
		});
	};
	const onBackgroundRevalidate =
		options.onBackgroundRevalidate ?? waitUntilFromEvent;

	const contextFor = function contextFor(
		event: RequestEvent,
		route: ConsentRouteName | undefined
	): ConsentRouteRequestContext {
		return {
			forwarding: () => readForwarding(event),
			// A relative backend such as `/api/self-host` is a route in this
			// app: SvelteKit answers it in-process, so the request's `Host`
			// never chooses where it goes.
			localFetch: event.fetch,
			path: readRestPath(event),
			route,
			waitUntil: (task) => onBackgroundRevalidate(task, event),
		};
	};

	return createConsentRouteMethodHandlers<Options, RequestHandler>(
		options.proxy,
		(route) => (event) =>
			handlerFor(event)(event.request, contextFor(event, route))
	);
};
