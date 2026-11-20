/**
 * SvelteKit `handle` hook that holds the consent config and reads the
 * request's consent context once.
 *
 * Without a handle, every `+layout.server.ts`, `+page.server.ts` and route
 * handler would re-parse the same headers and the same cookie. This runs
 * that work once and publishes it, with the mode `loadConsent` resolves
 * with, on `event.locals.inth`.
 */
import { building } from '$app/env';
import type { ConsentMode } from '@inth/sdk/modes';
import type {
	ConsentManifest,
	ConsentRequestHeaderInputs,
} from '@inth/sdk/schema/types';
import {
	normalizeRoutePrefix,
	readRequestConsent,
	resolveServerMode,
	writeConsentInputHeaders,
} from '@inth/sdk/server';
import type { RequestEvent } from '@sveltejs/kit';

import { injectModulePreloads } from './module-preload';
import {
	createServerStartInjector,
	loadServerScriptStart,
} from './server-script-start';
import { injectSurfaceStyles, nonceEarlyTapScript } from './surface-styles';
import type { InthLocals, ConsentRequestOptions } from './types';

export interface InthHandleOptions extends ConsentRequestOptions {
	/**
	 * The Inth backend. Defaults to the URL `consentManifest()` read from
	 * `PUBLIC_INTH_PROJECT_URL`. Required unless `mode` is `testing()`.
	 */
	projectUrl?: string;
	/**
	 * How the visitor is resolved. Plain data; `ConsentRoot` loads the code
	 * it needs in the browser only when it runs.
	 *
	 * - Omitted, or `manifest()` from `@inth/svelte/kit`: resolve from the
	 *   backend's consent manifest, which the build downloads. When it is
	 *   unavailable, ask the backend's `/v1/consent/init` and log a warning.
	 * - `hosted()` from `@inth/svelte/kit`: ask the backend's `/v1/consent/init` for
	 *   every visitor.
	 * - `testing()` from `@inth/svelte/testing`: the server resolves
	 *   nothing, and the browser resolves a policy with no network; its
	 *   transport throws in production builds.
	 *
	 * @default manifest()
	 */
	mode?: ConsentMode;
	/**
	 * Where `createConsentRoute()` is mounted, such as `/api/inth` for
	 * `src/routes/api/inth/[...path]/+server.ts`. The browser then resolves
	 * consent on pages the server did not, such as prerendered ones,
	 * through the app's own route. Without it, the browser asks the
	 * backend's `/v1/consent/init`. `/` is rejected: a catch-all route at the site
	 * root would catch every page.
	 */
	routePrefix?: string;
	/**
	 * Send the browser's consent saves through the consent route at
	 * `routePrefix`, so the browser talks only to this origin. The route
	 * needs `createConsentRoute({ proxy: true })` to forward them to
	 * `projectUrl`. Requires `routePrefix`.
	 *
	 * @default false
	 */
	proxy?: boolean;
	/**
	 * A manifest to resolve with instead of the one `consentManifest()`
	 * downloaded.
	 */
	snapshot?: ConsentManifest;
}

/**
 * The `handle` hook signature, assignable to SvelteKit's `Handle` in both
 * Kit 2 and Kit 3.
 *
 * Declared here because the two versions export `Handle` from different
 * modules: Kit 2 from `@sveltejs/kit`, Kit 3 only from `@sveltejs/kit/hooks`.
 * Importing either one leaves the other version's apps with an unresolved
 * type, which `skipLibCheck` turns into a silent `any`.
 */
export type InthHandle = (input: {
	event: RequestEvent;
	resolve: (
		event: RequestEvent,
		options?: {
			transformPageChunk?: (input: {
				done: boolean;
				html: string;
			}) => string | undefined;
		}
	) => Response | Promise<Response>;
}) => Promise<Response>;

/**
 * Rewrites the resolved inputs back onto the request as the canonical
 * `x-inth-*` / `sec-gpc` headers, so anything downstream that reads raw
 * headers (a proxied backend call, a nested handle) sees one normalized
 * shape instead of whichever CDN header happened to carry it.
 *
 * Request headers are immutable in some runtimes. When the write is refused
 * the normalized values are still on `event.locals.inth.inputs`, which is
 * what every helper in this package reads, so the request continues.
 */
const normalizeRequestHeaders = function normalizeRequestHeaders(
	headers: Headers,
	inputs: ConsentRequestHeaderInputs
): void {
	try {
		// The resolved language, not the browser's list: a downstream route
		// re-reads `accept-language`, and an `options.language` override has
		// to reach it too.
		writeConsentInputHeaders(headers, inputs);
	} catch {
		// Immutable headers — locals still carry the normalized inputs.
	}
};

/**
 * Creates the Inth SvelteKit handle.
 *
 * Register it in `src/hooks.server.ts`, alone or composed with `sequence()`:
 *
 * ```ts
 * import { inthHandle } from '@inth/svelte/kit';
 * import { sequence } from '@sveltejs/kit/hooks';
 *
 * export const handle = sequence(inthHandle(), myOtherHandle);
 * ```
 *
 * Type `event.locals.inth` with one line in `src/app.d.ts`:
 *
 * ```ts
 * /// <reference types="@inth/svelte/kit/locals" />
 * ```
 *
 * While SvelteKit prerenders, every page is shared between visitors: the
 * handle reads no cookie or geo header, and leaves no
 * stored consent, clock or privacy signal on `event.locals.inth`.
 *
 * @returns A `handle` hook that populates `event.locals.inth`.
 * @throws {TypeError} When `mode` is a transport with no data, which
 * cannot reach the browser, `routePrefix` is `/` or not a path, or `proxy`
 * is set without `routePrefix`.
 */
export const inthHandle = function inthHandle(
	options: InthHandleOptions = {}
): InthHandle {
	const routePrefix =
		options.routePrefix === undefined
			? undefined
			: normalizeRoutePrefix('@inth/svelte', options.routePrefix);
	// A `projectUrl` naming the route itself sends saves through it, which
	// is what `proxy` does: the route forwards them to the build's backend.
	const projectUrlIsRoute =
		routePrefix !== undefined &&
		options.projectUrl?.replace(/\/+$/u, '') === routePrefix;
	const proxy = options.proxy || projectUrlIsRoute;
	const projectUrl = projectUrlIsRoute ? undefined : options.projectUrl;
	const { mode } = resolveServerMode({
		adapter: '@inth/svelte',
		mode: options.mode,
		proxy,
		routePrefix,
	});
	return async ({ event, resolve }) => {
		const { headers } = event.request;
		// A prerendered page is one HTML file for every visitor: no cookie or
		// geo header of whoever triggered the build belongs in it.
		const { inputs, state: config } = readRequestConsent({
			adapter: '@inth/svelte',
			overrides: {
				country: options.country,
				language: options.language,
				region: options.region,
			},
			request: { headers, url: event.url },
			shared: building,
			storage: options.cookieName
				? { storageKey: options.cookieName }
				: undefined,
		});
		if (!building) {
			normalizeRequestHeaders(headers, inputs);
		}

		const locals: InthLocals = { config, inputs, mode };
		if (projectUrl !== undefined) {
			locals.projectUrl = projectUrl;
		}
		if (routePrefix !== undefined) {
			locals.routePrefix = routePrefix;
		}
		if (proxy) {
			locals.proxy = true;
		}
		if (options.snapshot !== undefined) {
			locals.snapshot = options.snapshot;
		}
		if (options.cookieName !== undefined) {
			locals.cookieName = options.cookieName;
		}
		if (building) {
			locals.shared = true;
		}
		(event.locals as { inth?: InthLocals }).inth = locals;

		// When the visitor's consent already lets some `scripts` run, the
		// provider renders a start for them; it goes at the end of `<body>`,
		// so they start before the page hydrates. Never in prerendered HTML,
		// which is no one visitor's.
		const injectServerStart = building
			? undefined
			: (await loadServerScriptStart(),
				createServerStartInjector(event.locals));

		// A page whose provider configures scripts or blocker rules names
		// their on-demand chunks in its head; link them so the browser
		// fetches them with the app's code. A server-rendered banner names
		// its stylesheets the same way; they go into the HTML, so no
		// stylesheet request holds back the first paint. Prerendered pages
		// too: both are the same for every visitor.
		return await resolve(event, {
			transformPageChunk: ({ done, html }) => {
				const page = injectModulePreloads(
					nonceEarlyTapScript(injectSurfaceStyles(html))
				);
				return injectServerStart ? injectServerStart(page, done) : page;
			},
		});
	};
};
