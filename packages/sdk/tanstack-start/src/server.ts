/**
 * `@inth/tanstack-start/server` server-only helpers.
 *
 * Reads the incoming request (cookies + headers via `getRequest()` from
 * `@tanstack/react-start/server`) and produces a JSON-serializable
 * `ConsentState` (a `KernelConfig` without `transport`). The root route
 * loader returns it, and the client `ConsentRoot` reads it back with
 * `Route.useLoaderData()`.
 *
 * The recommended `__root.tsx` shape:
 *
 * ```tsx
 * import { createRootRoute, Outlet } from '@tanstack/react-router';
 * import { createServerFn } from '@tanstack/react-start';
 * import { ConsentRoot } from '@inth/tanstack-start';
 * import {
 *   consentLoaderOptions,
 *   createConsentStateHandler,
 * } from '@inth/tanstack-start/server';
 *
 * const getConsentState = createServerFn({ method: 'GET' }).handler(
 *   createConsentStateHandler()
 * );
 *
 * export const Route = createRootRoute({
 *   ...consentLoaderOptions,
 *   loader: async () => ({ consent: await getConsentState() }),
 *   component: RootComponent,
 * });
 *
 * function RootComponent() {
 *   const { consent } = Route.useLoaderData();
 *   return (
 *     <ConsentRoot state={consent}>
 *       <Outlet />
 *     </ConsentRoot>
 *   );
 * }
 * ```
 *
 * The backend URL and the policy snapshot come from `consentManifest()` in
 * `vite.config.ts` (`@inth/sdk/generated`). The state carries the backend
 * URL, the mode and the route prefix, so `ConsentRoot` needs nothing else.
 *
 * The state travels only through loader data, never through module state,
 * so the server-rendered HTML and the hydrated tree always agree. Because
 * the loader is a server function call, the same code keeps working under
 * `ssr: false`, `ssr: 'data-only'`, and `defaultSsr: false`: the loader
 * then runs in the browser and the server function becomes an HTTP call
 * to the Start server, which still reads the real request headers.
 *
 * This module imports `@tanstack/react-start/server` lazily and must only
 * run on the server: inside server functions, server route handlers, and
 * request middleware. Route files still import `consentLoaderOptions` from
 * it, and route definitions ship to the browser, so browser builds resolve
 * this entry to `server-browser.ts` instead (the `browser` export
 * condition). Keep the two export lists in step.
 */

import { mergeInitOutputIntoKernelConfig } from '@inth/sdk/engine';
import type {
	ConsentJourneyOption,
	ExperimentState,
	JourneyState,
	KernelConfig,
	ServerExperiment,
} from '@inth/sdk/engine';
import {
	projectUrl as generatedProjectUrl,
	snapshot as generatedSnapshot,
} from '@inth/sdk/generated';
import type { ConsentMode } from '@inth/sdk/modes';
import type { ConsentManifest, InitOutput } from '@inth/sdk/schema/types';
import {
	DEFAULT_CONSENT_ROUTE_PREFIX,
	normalizeRoutePrefix,
	resolveRequestConsent,
} from '@inth/sdk/server';
import type {
	ManifestCache,
	ResolveRequestConsentOptions,
} from '@inth/sdk/server';

import { handledRequestFor } from './libs/handled-request';
import { isPrerendering } from './libs/prerendering';
import {
	readConsentInputs,
	rememberVisitorRender,
} from './libs/request-inputs';

type Awaitable<Value> = Promise<Value> | Value;

export type { ManifestCache } from '@inth/sdk/server';

/**
 * Where the helpers read the current request from. Defaults to
 * `getRequest()` from `@tanstack/react-start/server`.
 */
export type ConsentRequestSource = Request | (() => Awaitable<Request>);

/**
 * The core merge helpers type their result as the full `KernelConfig`. They
 * never set `transport`, so dropping the key only narrows the type; it keeps
 * the loader payload provably serializable.
 */
const stripTransport = function stripTransport({
	transport: _transport,
	...config
}: KernelConfig): ConsentState {
	return config;
};

const readCurrentRequest = async function readCurrentRequest(
	source: ConsentRequestSource | undefined
): Promise<Request> {
	if (source instanceof Request) {
		return source;
	}
	if (source) {
		return await source();
	}
	const { getRequest } = await import('@tanstack/react-start/server');
	return getRequest();
};

/**
 * How {@link resolveConsent} reads the current request: the clock, the
 * consent cookie, explicit geo/language overrides, and the request source.
 */
export interface ConsentRequestOptions {
	/** Request clock reused for validation and hydration. */
	now?: number;
	/**
	 * Cookie name holding persisted consent. Defaults to `c15t`, the
	 * persistence module's storage key. Set this only if you customized
	 * `storageConfig.storageKey` client-side; it must match.
	 */
	cookieName?: string;

	/**
	 * If provided, override the auto-detected country from request headers.
	 * Mainly useful for tests and local development.
	 */
	country?: string;

	/**
	 * If provided, override the auto-detected language.
	 */
	language?: string;

	/**
	 * The request to read, or a function that returns it. Defaults to
	 * `getRequest()` from `@tanstack/react-start/server`. Pass a plain
	 * `Request` in tests, or the `request` a server route handler or
	 * request middleware already holds.
	 */
	request?: ConsentRequestSource;
}

/**
 * Type alias re-exported so consumers can stay within
 * `@inth/tanstack-start`.
 */
export type { KernelConfig } from '@inth/sdk/engine';

/**
 * Where the browser sends consent requests. {@link resolveConsent} puts it
 * on the state, so `ConsentRoot` reads it from there.
 */
export interface ConsentClientConfig {
	/**
	 * Backend URL the browser saves to. The route prefix when the consent
	 * route proxies saves.
	 */
	projectUrl?: string;
	/** The mode, as data. `undefined` means `manifest()`. */
	mode?: ConsentMode;
	/** Where the consent route is mounted, such as `/api/c15t`. */
	routePrefix?: string;
}

/**
 * The visitor's resolved consent state: the JSON-serializable subset of
 * `KernelConfig` the server helpers return and `ConsentRoot` consumes, plus
 * the {@link ConsentClientConfig} the browser needs.
 *
 * `KernelConfig.transport` holds functions, and TanStack Start's server
 * function types reject any return value that may carry one. Returning this
 * narrower type is what lets `createServerFn().handler(...)` accept the
 * helpers directly. `ConsentRoot` accepts it as-is.
 */
export type ConsentState = Omit<KernelConfig, 'transport'> &
	ExperimentState &
	JourneyState &
	ConsentClientConfig;

// -- Resolving the visitor's state ------------------------------------------

/** Options for {@link resolveConsent}. */
export interface ResolveConsentOptions extends ConsentRequestOptions {
	/**
	 * How the visitor's policy is resolved. The state carries it to
	 * `ConsentRoot`.
	 *
	 * - Omitted, or `manifest()` from `@inth/tanstack-start`: resolve here
	 *   from the policy snapshot the build downloaded, or the backend's
	 *   manifest. When it is unavailable, ask the backend's `/init` and log
	 *   a warning. `manifest({ resolve: 'browser' })` leaves it to the
	 *   browser.
	 * - `hosted()`: ask the hosted backend's `/init` at `projectUrl`.
	 * - `testing()` from `@inth/tanstack-start/testing`: the server
	 *   resolves nothing and the browser resolves a policy with no
	 *   network; its transport throws in production builds.
	 *
	 * @default manifest()
	 */
	mode?: ConsentMode;

	/**
	 * Backend base URL of your c15t instance, for example
	 * `https://consent.example.com`. Defaults to the URL `consentManifest()`
	 * read from `VITE_C15T_BACKEND_URL` or `VITE_INTH_PROJECT_URL`. The
	 * helper reads
	 * `${projectUrl}/manifest` through the in-process manifest cache and
	 * resolves init locally, so the first paint already carries policy, UI,
	 * translations, and IAB metadata.
	 *
	 * Relative URLs are resolved against the request's own origin
	 * (`request.url`); set `trustForwardedHeaders` to use `x-forwarded-*`
	 * behind a trusted proxy. Do not point this at the app's own consent
	 * route: a server fetching itself during SSR deadlocks the dev server,
	 * so the helper never fetches under `routePrefix` (`/api/c15t` when
	 * unset) and returns the cookie-and-headers state instead. Other
	 * relative URLs are fetched.
	 */
	projectUrl?: string;

	/**
	 * Inline manifest for hosts that already loaded it, such as an
	 * in-process `@c15t/backend`. Defaults to the snapshot
	 * `consentManifest()` fetched during the build. `undefined`, which a
	 * build that could not fetch the manifest produces, makes the server
	 * fetch the policy at runtime.
	 */
	snapshot?: ConsentManifest | undefined;

	/**
	 * Fetch implementation for the manifest and GVL requests. Defaults to
	 * `globalThis.fetch`.
	 */
	fetch?: typeof globalThis.fetch;

	/**
	 * Request headers to forward onto the manifest fetch, for example an
	 * authentication token a private backend requires. Keep these
	 * tenant-level: the manifest cache is partitioned by a digest of the
	 * forwarded headers, so a per-visitor value defeats the cache.
	 */
	forwardHeaders?: string[];

	/**
	 * Cookie names to forward on the manifest fetch. No cookies are
	 * forwarded by default: the manifest is tenant-level data and the c15t
	 * backend does not read cookies, so nothing from your origin's cookie
	 * jar needs to leave. Set this only for a backend that gates the
	 * manifest on a cookie.
	 */
	cookieNames?: readonly string[];

	/**
	 * Resolve a relative `projectUrl` or `manifestUrl` against the
	 * request's `x-forwarded-host` and `x-forwarded-proto` instead of
	 * `request.url`. Off by default because those headers are
	 * client-controlled unless a trusted proxy strips them; turn it on only
	 * behind such a proxy.
	 *
	 * @default false
	 */
	trustForwardedHeaders?: boolean;

	/**
	 * Manifest cache to read through. Defaults to the module-level cache
	 * shared with `createConsentRoute()`. Pass `createManifestCache()`
	 * to isolate tests or tenants.
	 */
	cache?: ManifestCache;

	/**
	 * Receives manifest work that outlives this request (a background
	 * revalidation, or a manifest request `timeoutMs` stopped waiting for),
	 * so the host can keep it alive past the response on runtimes that stop
	 * detached work once a response is sent (a platform `waitUntil`, for
	 * example). The promise never rejects. Not called when the manifest is
	 * fresh or the request waits for the upstream to finish.
	 */
	onBackgroundRevalidate?: (revalidation: Promise<void>) => void;

	/**
	 * Longest the render waits for the visitor's policy, in milliseconds,
	 * counted from the manifest request. When it runs out the helper returns
	 * the cookie-and-headers state: no consent UI in the server HTML,
	 * optional categories denied, gated scripts and embeds blocked. The
	 * client then runs init on mount. The manifest
	 * request keeps running and fills the cache for the next render. `false`
	 * waits for the manifest cache's own request timeout (5 seconds).
	 *
	 * @default 500
	 */
	timeoutMs?: number | false;

	/**
	 * The consent journey scope this render reports. Pass `ConsentRoot` the
	 * same `journey`.
	 */
	journey?: ConsentJourneyOption;

	/**
	 * The banner experiment with the arm this request runs, from your
	 * feature flag. While the visitor has no stored choice, the render's
	 * session report carries the arm, so the backend counts the visitors
	 * each arm's banner was owed to. The returned state carries the
	 * experiment to `ConsentRoot`, so the client needs no `experiment`
	 * option of its own.
	 *
	 * @example
	 * ```ts
	 * resolveConsent({ experiment: { ...bannerShape, arm } });
	 * ```
	 */
	experiment?: ServerExperiment;

	/**
	 * Where you mounted `createConsentRoute()`, such as `/api/c15t` for
	 * `src/routes/api/c15t/$.ts`. The state carries it to `ConsentRoot`: the
	 * browser then gets init from `${routePrefix}/init`, and saves assert the
	 * decision inputs it resolved. Deferred public vendor lists load through
	 * the route, and the render never fetches a URL under the prefix on its
	 * own origin. Unset, the browser gets init from `${projectUrl}/init`.
	 * Same option and default (none) as Next.js
	 * `defineConsentConfig({ routePrefix })`. `/` is rejected: a catch-all
	 * route at the site root would catch every page.
	 */
	routePrefix?: string;

	/**
	 * The route at {@link routePrefix} was created with
	 * `createConsentRoute({ proxy: true })`, so the browser sends saves
	 * through it instead of straight to `projectUrl`, or to `hosted()`'s
	 * own `projectUrl`, which the server keeps using. Needs `routePrefix`.
	 *
	 * @default false
	 */
	proxy?: boolean;

	/**
	 * The HTML this render produces is served to every visitor. A shared
	 * render reads no cookie or geo header, carries no stored consent,
	 * clock, privacy signal or experiment, and skips the manifest prefetch,
	 * so the browser resolves the visitor itself. Defaults to `true` while
	 * TanStack Start prerenders (`TSS_PRERENDERING`), `false` otherwise.
	 */
	shared?: boolean;
}

/** What the server resolves for each mode. */
const serverModeOptions = function serverModeOptions(
	options: ResolveConsentOptions,
	projectUrl: string | undefined
): Pick<
	ResolveRequestConsentOptions,
	'projectUrl' | 'manifest' | 'manifestUrl' | 'mode'
> {
	const { mode: selected } = options;
	if (selected?.type === 'testing') {
		// The browser resolves it, with the transport that refuses to run in
		// production.
		return {};
	}
	// A snapshot passed in is a manifest to resolve from, as in Next.js.
	if (selected?.type === 'hosted' && options.snapshot === undefined) {
		return {
			mode: projectUrl ? 'hosted' : undefined,
			projectUrl,
		};
	}
	const mode = selected?.type === 'manifest' ? selected : undefined;
	if (mode?.resolve === 'browser') {
		// The browser resolves the visitor; the render reads cookies and
		// headers only.
		return {};
	}
	let snapshot = mode?.snapshot;
	if (!snapshot && mode?.source !== 'runtime') {
		snapshot = 'snapshot' in options ? options.snapshot : generatedSnapshot;
	}
	const manifestUrl = mode?.manifestUrl;
	return {
		manifest: snapshot,
		manifestUrl,
		mode: projectUrl || manifestUrl || snapshot ? 'manifest' : undefined,
		projectUrl,
	};
};

/**
 * The browser's half of the options. A mode's `snapshot` stays on the
 * server unless the browser resolves the policy itself.
 */
const clientConfigFor = function clientConfigFor(
	options: ResolveConsentOptions,
	projectUrl: string | undefined,
	routePrefix: string | undefined
): ConsentClientConfig {
	if (options.proxy && routePrefix === undefined) {
		throw new Error(
			'@inth/tanstack-start: `proxy` sends saves through the consent route, so it needs `routePrefix`.'
		);
	}
	const config: ConsentClientConfig = {};
	const clientProjectUrl = options.proxy ? routePrefix : projectUrl;
	if (clientProjectUrl !== undefined) {
		config.projectUrl = clientProjectUrl;
	}
	const { mode } = options;
	if (mode?.type === 'manifest' && mode.resolve !== 'browser') {
		const { snapshot: _snapshot, ...data } = mode;
		config.mode = data;
	} else if (mode !== undefined) {
		config.mode = mode;
	}
	if (routePrefix !== undefined) {
		config.routePrefix = routePrefix;
	}
	return config;
};

/** The options' route prefix, checked; `undefined` when unset. */
const readRoutePrefix = function readRoutePrefix(
	options: ResolveConsentOptions
): string | undefined {
	return options.routePrefix === undefined
		? undefined
		: normalizeRoutePrefix('@inth/tanstack-start', options.routePrefix);
};

const resolveConsentState = async function resolveConsentState(
	options: ResolveConsentOptions
): Promise<ConsentState> {
	const projectUrl = options.projectUrl ?? generatedProjectUrl;
	const routePrefix = readRoutePrefix(options);
	const client = clientConfigFor(options, projectUrl, routePrefix);
	const request = await readCurrentRequest(options.request);
	const handled = await handledRequestFor(request);
	const server = serverModeOptions(options, projectUrl);
	const shared = options.shared ?? isPrerendering();
	if (!shared) {
		// The middleware keeps this HTML out of shared caches.
		rememberVisitorRender(handled);
	}
	const state = await resolveRequestConsent({
		...server,
		adapter: '@inth/tanstack-start',
		cache: options.cache,
		cookieNames: options.cookieNames,
		experiment: options.experiment,
		fetch: options.fetch,
		forwardHeaders: options.forwardHeaders,
		gvlRoute: routePrefix === undefined ? undefined : `${routePrefix}/init`,
		journey: options.journey,
		now: options.now,
		overrides: { country: options.country, language: options.language },
		// The app's own consent route: a render fetching it would call
		// itself. Other relative URLs, such as a backend mounted elsewhere
		// on this origin, are fetched. Without a prefix, the conventional
		// mount is guarded.
		ownRoutes: [routePrefix ?? DEFAULT_CONSENT_ROUTE_PREFIX],
		request: {
			headers: request.headers,
			// What `consentRequestMiddleware` normalized for this request, so
			// overrides survive runtimes with immutable headers.
			inputs: readConsentInputs(handled),
			url: request.url,
		},
		shared,
		storage: options.cookieName
			? { storageKey: options.cookieName }
			: undefined,
		timeoutMs: options.timeoutMs,
		trustForwardedHeaders: options.trustForwardedHeaders,
		waitUntil: options.onBackgroundRevalidate,
	});
	return { ...state, ...client };
};

/**
 * Resolves the visitor's consent state from the current TanStack Start
 * request.
 *
 * 1. Reads the consent cookie, the CDN geo headers (plus the `x-c15t-*`
 *    overrides `consentRequestMiddleware()` wrote), `accept-language`, and
 *    `sec-gpc`.
 * 2. Resolves the policy for the {@link ResolveConsentOptions.mode}. The
 *    default `manifest()` uses the build's snapshot, or loads the manifest
 *    through the in-process cache, and resolves init locally for this
 *    request's country, region, language, and GPC signal.
 * 3. Folds the result into the state so first paint is correct without
 *    waiting for a client roundtrip, and adds the backend URL, mode and
 *    route prefix `ConsentRoot` needs.
 *
 * Never calls the app's own consent route. If anything fails, or the
 * manifest does not arrive within `timeoutMs` (500 ms by default), returns
 * the cookie-and-headers state: no consent UI in the server HTML, optional
 * categories denied, and the client root runs init on mount.
 *
 * @param options - Mode, route prefix and request overrides. The backend
 * URL and snapshot default to what `consentManifest()` provides.
 * @returns A serializable state for `ConsentRoot`.
 * @throws {Error} When `proxy` is set without `routePrefix`.
 * @throws {TypeError} When `routePrefix` is `/` or not a path.
 */
export const resolveConsent = async function resolveConsent(
	options: ResolveConsentOptions = {}
): Promise<ConsentState> {
	return await resolveConsentState(options);
};

/**
 * Folds a raw init payload (for example the JSON a same-origin init route
 * returned) into a consent state. Exposed for custom loaders that already
 * hold an `InitOutput`.
 *
 * @param base - Cookie-and-headers state, such as from
 * `resolveConsent({ mode: manifest({ resolve: 'browser' }) })`.
 * @param init - The init payload to merge.
 * @returns The merged state.
 */
export const mergeInitIntoConsentState = function mergeInitIntoConsentState(
	base: ConsentState,
	init: InitOutput
): ConsentState {
	return stripTransport(mergeInitOutputIntoKernelConfig(base, init));
};

// -- Route wiring ------------------------------------------------------------

export { consentLoaderOptions } from './libs/loader-options';

/**
 * Builds the handler for the consent state server function.
 *
 * TanStack Start keys each server function's ID to the file path of the
 * `createServerFn().handler()` call site and requires that call to be a
 * top-level assignment in your own module, so a function built inside this
 * package would carry an ID bound to the package's build and fail to
 * resolve at runtime. Declare the server function in your code and pass
 * this factory's result as its handler:
 *
 * @example
 * ```ts
 * import { createServerFn } from '@tanstack/react-start';
 * import { createConsentStateHandler } from '@inth/tanstack-start/server';
 *
 * export const getConsentState = createServerFn({ method: 'GET' }).handler(
 *   createConsentStateHandler()
 * );
 * ```
 *
 * @example
 * ```ts
 * // With src/routes/api/c15t/$.ts mounted, the browser re-inits there.
 * createConsentStateHandler({ routePrefix: '/api/c15t' });
 * ```
 *
 * @param options - {@link resolveConsent} options: `mode`, `routePrefix`,
 * `snapshot` and the rest. `request` defaults to `getRequest()`.
 * @returns A handler that resolves to the request's consent state.
 * @throws {TypeError} When `routePrefix` is `/` or not a path, when the
 * server function is declared rather than on a request.
 */
export const createConsentStateHandler = function createConsentStateHandler(
	options: ResolveConsentOptions = {}
): () => Promise<ConsentState> {
	readRoutePrefix(options);
	return () => resolveConsent(options);
};
