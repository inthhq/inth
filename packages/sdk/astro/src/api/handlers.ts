/**
 * Route handlers for `${routePrefix}/v1/consent/init` and `${routePrefix}/v1/consent/manifest`.
 *
 * The routes themselves live in `@inth/sdk/server`
 * (`createConsentRouteHandler`), shared with the Next.js, Nuxt, SvelteKit
 * and TanStack Start adapters. This module mounts them for Astro: it maps
 * the integration's resolved options onto the handler, applies the
 * configured locale, and registers detached work with the adapter's
 * `waitUntil` from `locals`.
 */

import { extractConsentRequestInputs } from '@inth/sdk/schema/types';
import {
	createConsentRouteHandler,
	readWaitUntil,
	resolveServerMode,
} from '@inth/sdk/server';
import type { ConsentRouteFetchGvl, ManifestFetch } from '@inth/sdk/server';

import { absoluteManifestUrl } from '../libs/absolute-manifest-url';
import type { InthResolvedOptions } from '../types';

/**
 * The per-request context a route or the middleware can pass so a
 * background refresh is registered with the platform. Astro adapters that
 * cancel detached work after the response expose `waitUntil` on it
 * (Cloudflare); anything else is left alone.
 */
export interface RequestLifetime {
	locals?: unknown;
	/**
	 * The path below the route, from its rest parameter (`params.path` for
	 * `[...path]`). Without it the route is a fixed mount: a `GET` that
	 * does not end in `/manifest` is init.
	 */
	path?: string;
}

interface AdapterLocals {
	cfContext?: unknown;
	runtime?: { ctx?: unknown };
}

/**
 * Hands a promise to the `waitUntil` an Astro adapter exposes, so a
 * background refresh outlives the response on runtimes that would cancel
 * it. The Cloudflare adapter puts the execution context on
 * `locals.cfContext` from Astro 6, and on `locals.runtime.ctx` before that.
 * A no-op where there is neither.
 */
export const waitUntilFromLocals = function waitUntilFromLocals(
	revalidation: Promise<void>,
	locals: unknown
): void {
	const adapterLocals = locals as AdapterLocals | undefined;
	// `cfContext` first: the Astro 6 adapter keeps a `runtime.ctx` getter that
	// throws, so it is only read when there is no `cfContext`.
	const waitUntil =
		readWaitUntil(adapterLocals?.cfContext) ??
		readWaitUntil(adapterLocals?.runtime?.ctx);
	waitUntil?.(revalidation);
};

/** Options accepted by the route handler factory. */
export interface ConsentRouteHandlerOptions {
	options: InthResolvedOptions;
	/** Override fetch, mainly for tests. */
	fetch?: ManifestFetch;
	/**
	 * Fetches the Global Vendor List when the resolved policy is IAB.
	 * Defaults to the shared server cache, with a deadline on the upstream
	 * request.
	 */
	fetchGvl?: ConsentRouteFetchGvl;
	/**
	 * Receives the promise of detached work started by this request (a
	 * background manifest revalidation, a session report), so the host can
	 * keep it alive past the response on runtimes that stop detached work
	 * once a response is sent (a platform `waitUntil`, for example). The
	 * promise never rejects. Defaults to the adapter's `waitUntil` on
	 * `locals` when the route passes them.
	 */
	onBackgroundRevalidate?: (revalidation: Promise<void>) => void;
}

/**
 * Build the `init` and `manifest` route handlers, the ones behind the
 * injected route.
 *
 * With `routePrefix: false` the browser never calls a route you build from
 * these: a page the server resolved inits again through the backend's
 * `/init`. Mount them for other clients, or let browser resolution fetch
 * the manifest from them with
 * `manifest({ resolve: 'browser', manifestUrl: '/api/inth/manifest' })`.
 * To have the browser use the route for `/init`, keep the injected route
 * and change its path with `routePrefix`.
 *
 * @param handlerOptions - Integration options plus test seams.
 * @returns `init`, `manifest`, and a `GET` that dispatches between them by
 * the path below the route, and answers 404 for any other path.
 * @example
 * ```ts
 * // src/pages/api/inth/[...path].ts, with routePrefix: false and
 * // mode: manifest({ resolve: 'browser', manifestUrl: '/api/inth/manifest' })
 * import options from 'virtual:inth/options';
 * import { createConsentRouteHandlers } from '@inth/astro/server';
 *
 * const handlers = createConsentRouteHandlers({ options });
 * export const GET = ({ locals, params, request }) =>
 *   handlers.GET(request, { locals, path: params.path });
 * ```
 */
export const createConsentRouteHandlers = function createConsentRouteHandlers(
	handlerOptions: ConsentRouteHandlerOptions
) {
	const { i18n, mode, projectUrl, routePrefix } = handlerOptions.options;
	const { route } = resolveServerMode({
		adapter: '@inth/astro',
		mode,
		projectUrl,
		routePrefix,
	});
	const handle = createConsentRouteHandler({
		...route,
		adapter: '@inth/astro',
		fetch: handlerOptions.fetch,
		fetchGvl: handlerOptions.fetchGvl,
		manifestUrl: route.manifestUrl ?? absoluteManifestUrl(mode),
		routePrefix,
	});
	const locale = i18n?.locale;
	// The same override the SSR path applies, so both resolve one language,
	// and one set of vendor-list translations.
	const inputsFor = (request: Request) =>
		locale
			? extractConsentRequestInputs(request.headers, { language: locale })
			: undefined;

	const waitUntilFor = function waitUntilFor(
		lifetime: RequestLifetime | undefined
	): ((task: Promise<void>) => void) | undefined {
		if (handlerOptions.onBackgroundRevalidate) {
			return handlerOptions.onBackgroundRevalidate;
		}
		return lifetime
			? (task) => waitUntilFromLocals(task, lifetime.locals)
			: undefined;
	};

	/**
	 * `GET ${routePrefix}/v1/consent/init` — a resolved `InitOutput`, never cached.
	 *
	 * @param lifetime - The route's `{ locals }`, so detached work can be
	 * registered with the adapter's `waitUntil`.
	 */
	const init = function init(
		request: Request,
		lifetime?: RequestLifetime
	): Promise<Response> {
		return handle(request, {
			inputs: inputsFor(request),
			route: 'init',
			waitUntil: waitUntilFor(lifetime),
		});
	};

	/**
	 * `GET ${routePrefix}/v1/consent/manifest` — the manifest, with its own cache headers.
	 *
	 * @param lifetime - The route's `{ locals }`, so a background manifest
	 * refresh can be registered with the adapter's `waitUntil`.
	 */
	const manifest = function manifest(
		request: Request,
		lifetime?: RequestLifetime
	): Promise<Response> {
		return handle(request, {
			route: 'manifest',
			waitUntil: waitUntilFor(lifetime),
		});
	};

	/**
	 * The catch-all route: `init` or `manifest` by the path below the
	 * route, and 404 for anything else under the prefix.
	 *
	 * @param lifetime - The route's `{ locals, path }`.
	 */
	const GET = function GET(
		request: Request,
		lifetime?: RequestLifetime
	): Promise<Response> {
		return handle(request, {
			inputs: inputsFor(request),
			path: lifetime?.path,
			waitUntil: waitUntilFor(lifetime),
		});
	};

	return { GET, init, manifest };
};
