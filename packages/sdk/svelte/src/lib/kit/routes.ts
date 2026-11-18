/**
 * The same-origin consent route for SvelteKit.
 *
 * A prerendered page carries no visitor's consent, so the browser resolves
 * it. With this route, it does so through the app's own origin: the route
 * resolves `/init` from the snapshot the build downloaded, and serves the
 * manifest for browser resolution. The routes themselves live in
 * `@c15t/core/server` (`createConsentRouteHandler`), shared with the
 * Next.js, Nuxt, Astro and TanStack Start adapters; this module mounts them
 * as a SvelteKit `RequestHandler`. What it adds is SvelteKit's: the rest
 * parameter picks the route, `event.fetch` answers a relative backend
 * in-process, `event.getClientAddress()` and `event.url` vouch for the
 * proxy's hop chain, and `platform.context.waitUntil` keeps detached work
 * alive.
 */
import {
	projectUrl as builtProjectUrl,
	snapshot as builtSnapshot,
} from '@c15t/core/generated';
import { createConsentRouteHandler, readWaitUntil } from '@c15t/core/server';
import type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
	ConsentRouteFetchGvl,
	ConsentRouteHandler,
	ConsentRouteRequestContext,
	ManifestFetch,
} from '@c15t/core/server';
import type { ConsentManifest } from '@c15t/schema/types';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';

import type { C15tLocals } from './types';

export type { ConsentProxyOptions } from '@c15t/core/server';

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

/** Removes surrounding slashes in linear time. */
const trimPathSlashes = function trimPathSlashes(value: string): string {
	let start = 0;
	let end = value.length;
	while (end > 0 && value[end - 1] === '/') {
		end -= 1;
	}
	while (start < end && value[start] === '/') {
		start += 1;
	}
	return value.slice(start, end);
};

const REST_PARAM = /\[\.\.\.(?<name>[^\]=]+)(?:=[^\]]+)?\]/u;

/**
 * The path below the route's rest parameter (`[...path]` in
 * `src/routes/api/c15t/[...path]/+server.ts`), or `undefined` when the route
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

/** Options for {@link createConsentRoute}. */
export interface ConsentRouteOptions {
	/**
	 * The c15t backend. Defaults to what `c15tHandle()` was given: a
	 * `hosted()` mode's `projectUrl`, then the handle's `projectUrl`, then
	 * the URL `consentManifest()` read from `PUBLIC_C15T_BACKEND_URL` or
	 * `PUBLIC_INTH_PROJECT_URL`. A
	 * handle `projectUrl` that points at this route, as in the proxy setup,
	 * is skipped. The manifest is read from `${projectUrl}/manifest` when
	 * there is no snapshot.
	 */
	projectUrl?: string;
	/**
	 * Full manifest URL. Takes precedence over `${projectUrl}/manifest`.
	 * Defaults to the `manifestUrl` of the handle's `manifest()` mode.
	 */
	manifestUrl?: string;
	/**
	 * A manifest to resolve with. Defaults to the handle's: the mode's
	 * `snapshot`, then `c15tHandle({ snapshot })`, then the one
	 * `consentManifest()` downloaded.
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
	 * `x-forwarded-host` and `x-forwarded-proto` from `event.url`, the c15t
	 * version header, and `x-c15t-proxy: @c15t/svelte`. The hosted backend
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

/** The route's handlers: `GET`, or every method with `proxy`. */
export interface ConsentRouteHandlers {
	/** Serves `manifest` and `init`; with `proxy`, forwards the rest. */
	GET: RequestHandler;
}

/** The route's handlers when `proxy` is enabled. */
export interface ConsentProxyRouteHandlers extends ConsentRouteHandlers {
	POST: RequestHandler;
	PATCH: RequestHandler;
	PUT: RequestHandler;
	DELETE: RequestHandler;
	OPTIONS: RequestHandler;
}

/**
 * Picks the handler shape from the options: every method when `proxy` is
 * set to anything truthy, `GET` otherwise.
 */
export type ConsentRouteHandlersFor<Options extends ConsentRouteOptions> =
	Options extends { proxy: true | ConsentProxyOptions }
		? ConsentProxyRouteHandlers
		: ConsentRouteHandlers;

/** What the route resolves with, from its options and the handle's. */
interface RouteSource {
	projectUrl: string | undefined;
	manifestUrl: string | undefined;
	snapshot: ConsentManifest | undefined;
}

const trimTrailingSlashes = function trimTrailingSlashes(
	value: string
): string {
	let end = value.length;
	while (end > 1 && value[end - 1] === '/') {
		end -= 1;
	}
	return value.slice(0, end);
};

/**
 * Whether a handle's relative `projectUrl` names this route, as
 * `c15tHandle({ projectUrl: '/api/c15t', routePrefix: '/api/c15t' })` does
 * when saves go through the proxy. Forwarding there would call the route
 * itself.
 */
const pointsAtRoute = function pointsAtRoute(
	projectUrl: string,
	event: RequestEvent,
	locals: C15tLocals | undefined
): boolean {
	if (!projectUrl.startsWith('/')) {
		return false;
	}
	const target = trimTrailingSlashes(projectUrl);
	if (
		locals?.routePrefix !== undefined &&
		target === trimTrailingSlashes(locals.routePrefix)
	) {
		return true;
	}
	const rest = readRestPath(event);
	const pathname = trimTrailingSlashes(event.url.pathname);
	const mount =
		rest === undefined || rest === ''
			? pathname
			: pathname.slice(0, -(rest.length + 1));
	return target === trimTrailingSlashes(mount || '/');
};

/** The handle's backend URL, unless it points at this route. */
const readHandleProjectUrl = function readHandleProjectUrl(
	event: RequestEvent,
	locals: C15tLocals | undefined
): string | undefined {
	const fromHandle = locals?.projectUrl;
	if (fromHandle === undefined || pointsAtRoute(fromHandle, event, locals)) {
		return undefined;
	}
	return fromHandle;
};

/** The handle's snapshot, as `loadConsent` reads it. */
const readHandleSnapshot = function readHandleSnapshot(
	locals: C15tLocals | undefined
): ConsentManifest | undefined {
	const mode = locals?.mode;
	if (mode?.type !== 'manifest') {
		return locals?.snapshot ?? builtSnapshot;
	}
	if (mode.snapshot) {
		return mode.snapshot;
	}
	return mode.source === 'runtime'
		? undefined
		: (locals?.snapshot ?? builtSnapshot);
};

/**
 * The route's sources: explicit options first, then what `c15tHandle()`
 * stored on `event.locals.c15t`, then what the build downloaded. The same
 * order `loadConsent` uses, so the two agree.
 */
const readRouteSource = function readRouteSource(
	options: ConsentRouteOptions,
	event: RequestEvent
): RouteSource {
	const { c15t: locals } = (event.locals ?? {}) as { c15t?: C15tLocals };
	const mode = locals?.mode;
	// With browser resolution, `manifestUrl` is what the browser fetches
	// instead of this route.
	const modeManifestUrl =
		mode?.type === 'manifest' && mode.resolve !== 'browser'
			? mode.manifestUrl
			: undefined;
	return {
		manifestUrl: options.manifestUrl ?? modeManifestUrl,
		projectUrl:
			options.projectUrl ??
			readHandleProjectUrl(event, locals) ??
			builtProjectUrl,
		snapshot: options.snapshot ?? readHandleSnapshot(locals),
	};
};

/**
 * Creates the catch-all consent route. Only prerendered pages need it: the
 * server resolves every other page in `loadConsent`.
 *
 * The route reads the snapshot, backend URL and mode `c15tHandle()` was
 * given from `event.locals.c15t`, so they are set once, on the handle.
 * Options passed here win.
 *
 * ```ts
 * // src/routes/api/c15t/[...path]/+server.ts
 * import { createConsentRoute } from '@c15t/svelte/kit';
 *
 * export const { GET } = createConsentRoute();
 * ```
 *
 * Then tell the browser where it is:
 *
 * ```ts
 * // src/hooks.server.ts
 * export const handle = c15tHandle({ routePrefix: '/api/c15t' });
 * ```
 *
 * With `proxy: true` the route also forwards consent writes to the
 * backend:
 *
 * ```ts
 * export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } =
 *   createConsentRoute({ proxy: true });
 * ```
 *
 * @param routeOptions - Manifest source, fetch implementation, GVL
 * fetcher, proxy. Every one is optional.
 * @returns `GET`; with `proxy` on, `POST`, `PATCH`, `PUT`, `DELETE` and
 * `OPTIONS` join.
 */
export const createConsentRoute = function createConsentRoute<
	Options extends ConsentRouteOptions = ConsentRouteOptions,
>(routeOptions?: Options): ConsentRouteHandlersFor<Options> {
	const options: ConsentRouteOptions = routeOptions ?? {};
	// The handle passes the same values on every request, so the core
	// handler is built once and rebuilt only if they change.
	let built: { handle: ConsentRouteHandler; source: RouteSource } | undefined;
	const handlerFor = function handlerFor(
		event: RequestEvent
	): ConsentRouteHandler {
		const source = readRouteSource(options, event);
		if (
			built &&
			built.source.projectUrl === source.projectUrl &&
			built.source.manifestUrl === source.manifestUrl &&
			built.source.snapshot === source.snapshot
		) {
			return built.handle;
		}
		const handle = createConsentRouteHandler({
			adapter: '@c15t/svelte',
			fetch: options.fetch,
			fetchGvl: options.fetchGvl,
			manifest: source.snapshot,
			manifestUrl: source.manifestUrl,
			projectUrl: source.projectUrl,
			proxy: options.proxy,
		});
		built = { handle, source };
		return handle;
	};
	const onBackgroundRevalidate =
		options.onBackgroundRevalidate ?? waitUntilFromEvent;

	const contextFor = function contextFor(
		event: RequestEvent,
		route?: 'proxy'
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

	const GET: RequestHandler = (event) =>
		handlerFor(event)(event.request, contextFor(event));
	if (!options.proxy) {
		return { GET } as ConsentRouteHandlersFor<Options>;
	}
	const proxy: RequestHandler = (event) =>
		handlerFor(event)(event.request, contextFor(event, 'proxy'));
	const proxied: ConsentProxyRouteHandlers = {
		DELETE: proxy,
		GET,
		OPTIONS: proxy,
		PATCH: proxy,
		POST: proxy,
		PUT: proxy,
	};
	return proxied as ConsentRouteHandlersFor<Options>;
};
