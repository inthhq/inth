/**
 * Same-origin consent routes, written once for every server adapter.
 *
 * Manifest mode moves policy resolution off the browser's critical path:
 * the host reads one geo-independent, CDN-cacheable manifest and resolves
 * `/v1/consent/init` locally per request. This module turns a Web `Request` into the
 * `Response` for those routes:
 *
 * - `GET …/v1/consent/manifest` passes the cached backend manifest through
 *   with its cache headers, `Age` and `ETag` revalidation.
 * - `GET …/v1/consent/init` resolves the visitor's init from that manifest (geo,
 *   language, GPC), attaches the Global Vendor List for IAB policies and
 *   reports the session to the backend.
 *   The same route serves versioned vendor-list requests (`?inth-gvl=`).
 * - With `proxy` on, every other allowlisted path is forwarded to the
 *   backend through {@link forwardConsentRequest}.
 *
 * Framework adapters (Next.js, TanStack Start, SvelteKit, Astro, Nuxt) only
 * translate their entry point into a `Request` and a
 * {@link ConsentRouteRequestContext}: which route was hit, how to keep
 * detached work alive, and how to reach the app's own routes in-process.
 *
 * Server-only: it resolves init with every bundled translation and forwards
 * the visitor's IP to the backend in session reports.
 */

import {
	appendInitParams,
	appendJourneyParams,
	applyInitParamsToHeaders,
	CONSENT_REQUEST_HEADER_NAMES,
	extractConsentRequestInputs,
	getIpAddress,
	INIT_PARAM_HEADERS,
	POLICY_CONTRACT_VERSION,
	primaryLanguage,
	readJourneyParams,
	readManifestLevelParam,
	readPolicyResolutionWire,
	registryForManifestLevel,
	writePolicyResolutionWire,
} from '@inth/sdk-schema/types';
import type {
	AdTechProvider,
	ConsentManifest,
	ConsentManifestAdditionalConsent,
	ConsentManifestGVLReference,
	ConsentSessionSource,
	GlobalVendorList,
	InitOutput,
	ResolveInitFromManifestInputs,
	SessionJourney,
} from '@inth/sdk-schema/types';

import { markResponsePrivate } from '../libs/identity-headers';
import {
	fetchCachedManifest,
	getManifestAge,
	MANIFEST_PASSTHROUGH_HEADERS,
	ManifestUnavailableError,
	withResolutionBudget,
} from '../libs/manifest-cache-runtime';
import type {
	CachedManifestResponse,
	ManifestCache,
	ManifestFetch,
} from '../libs/manifest-cache-runtime';
import { warnManifestFallback } from '../libs/manifest-fallback';
import { inthProtocolHeaders } from '../libs/version-header';
import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from '../transports/ad-tech-provider-cache';
import type { AdTechProviderCache } from '../transports/ad-tech-provider-cache';
import {
	deferInitGvlToRoute,
	serveGvlReference,
} from '../transports/gvl-reference';
import { mapInitOutputToInitResponse } from '../transports/init-output';
import {
	getResolverInputsFromHeaders,
	resolveManifestInit,
} from '../transports/manifest-cache';
import { V1_ROUTES } from '../transports/v1/paths';
import { reportV1ConsentSession } from '../transports/v1/session-report';
import {
	CONSENT_PROXY_FORWARDING_HEADERS,
	filterCookieHeader,
	forwardConsentRequest,
	resolveConsentProxyOptions,
	stripIdentityForCleartext,
} from './consent-proxy';
import type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
} from './consent-proxy';
import { fetchServerGvl } from './gvl-cache';
import {
	resolveRequestProjectUrl,
	resolveRequestOrigin,
} from './request-origin';
import {
	mountOf,
	readUpstreams,
	relativeLoop,
	requestLoop,
} from './route-loop';
import {
	IN_PROCESS_ORIGIN,
	keepAlive,
	toPathFetch,
	trimPathSlashes,
} from './shared';

/**
 * Request header a server render sets on its call to the init route: the
 * longest, in whole milliseconds, the route may wait for upstream work
 * (manifest, vendor list, `/v1/consent/init` fallback) before failing. Values above
 * ten seconds are capped; anything that is not a whole number is ignored.
 */
export const CONSENT_ROUTE_TIMEOUT_HEADER = 'x-inth-timeout-ms';

/** Longest request-supplied budget honoured, in milliseconds. */
const MAX_ROUTE_TIMEOUT_MS = 10_000;

const INIT_CACHE_CONTROL = 'private, no-store';

/** A conservative BCP 47 shape: primary subtag plus up to two subtags. */
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/u;

/**
 * The paths below the prefix the route answers itself: the backend's own,
 * so a client builds the same URL on the backend and on this route.
 */
const INIT_PATH = trimPathSlashes(V1_ROUTES.init);
const MANIFEST_PATH = trimPathSlashes(V1_ROUTES.manifest);

/** Which consent route a request is for. */
export type ConsentRouteName = 'manifest' | 'init' | 'proxy';

/**
 * Loads the Global Vendor List for an IAB policy. Replaces the default
 * loader, which reads through the server GVL cache with a deadline.
 */
export type ConsentRouteFetchGvl = (input: {
	/** The manifest's vendor-list reference. */
	reference: ConsentManifestGVLReference;
	/** Primary language subtag the list should be localised to. */
	language: string;
	/** The route's configured fetch. */
	fetch: typeof globalThis.fetch;
}) => Promise<GlobalVendorList | null>;

/** Configuration for {@link createConsentRouteHandler}. */
export interface ConsentRouteHandlerOptions {
	/**
	 * Package name of the adapter, such as `@inth/nextjs`. Prefixes errors,
	 * names the adapter in session reports, and is sent as `x-inth-proxy`.
	 */
	adapter: string;
	/**
	 * Project URL, absolute or `/`-relative. The manifest is read from
	 * `${projectUrl}/v1/consent/manifest` unless `manifestUrl` is set;
	 * session reports, the init fallback and the proxy go here.
	 */
	projectUrl?: string;
	/** Full upstream manifest URL. Takes precedence over `projectUrl`. */
	manifestUrl?: string;
	/**
	 * An inline manifest. When set, no manifest is fetched and the backend
	 * is used only for reports and the proxy.
	 */
	manifest?: ConsentManifest;
	/** Fetch for absolute upstream URLs. Defaults to `globalThis.fetch`. */
	fetch?: ManifestFetch;
	/**
	 * Per-framework fetch hint for the manifest request, such as Next.js
	 * `{ next: { revalidate: 300 } }`. Not part of the cache key.
	 */
	manifestFetchInit?: Omit<RequestInit, 'headers' | 'method'>;
	/** Replaces the default Global Vendor List loader. */
	fetchGvl?: ConsentRouteFetchGvl;
	/**
	 * Resolve a relative `projectUrl` or `manifestUrl` against the request's
	 * forwarding headers instead of `request.url`, and believe the client IP
	 * chain when proxying. Only behind a proxy that sets those headers and
	 * drops incoming ones.
	 *
	 * @default false
	 */
	trustForwardedHeaders?: boolean;
	/**
	 * Forward consent writes and other allowlisted paths to `projectUrl`.
	 * With it on, the manifest request also carries the cookies
	 * `cookieNames` names and the extra `forwardHeaders`, and a manifest
	 * read with them is answered `private, no-store`.
	 *
	 * @default false
	 */
	proxy?: boolean | ConsentProxyOptions;
	/**
	 * Manifest cache to read through. Defaults to the process cache every
	 * adapter shares.
	 */
	cache?: ManifestCache;
	/**
	 * The path the route is mounted at, such as `/api/inth`, when the
	 * adapter knows it before a request. A relative `projectUrl` or
	 * `manifestUrl` on or beneath it then fails at setup. Without it, a
	 * request that carries {@link ConsentRouteRequestContext.path} tells the
	 * route where it is mounted. Either way, an upstream URL that leads
	 * back into the route fails the request with a 500.
	 */
	routePrefix?: string;
}

/** What the adapter knows about one request that a `Request` does not carry. */
export interface ConsentRouteRequestContext {
	/**
	 * The route this request is for, when the adapter mounted a dedicated
	 * handler. Without it the route comes from {@link path}.
	 */
	route?: ConsentRouteName;
	/**
	 * Path below the route prefix, from a catch-all parameter
	 * (`v1/consent/init`, `v1/consent/manifest`, `v1/consent/records`). `''`
	 * and `v1/consent/init` answer init, `v1/consent/manifest` answers the
	 * manifest, anything else goes to the proxy or is a 404.
	 * Without a path the route is a fixed mount: its last URL segment
	 * decides, and a `GET` that does not end in `/manifest` is init.
	 */
	path?: string;
	/**
	 * Keeps detached work alive past the response: background manifest
	 * refreshes, session reports, fills a request stopped waiting for, and
	 * the rest of a request whose client went away.
	 */
	waitUntil?: (task: Promise<void>) => void;
	/**
	 * Fetch that answers this app's own routes in-process when given a path,
	 * such as SvelteKit `event.fetch` or Nitro `localFetch`. When set, a
	 * `/`-relative `projectUrl` or `manifestUrl` is fetched through it and
	 * the request's host never decides the target.
	 */
	localFetch?: ManifestFetch;
	/**
	 * Hop-chain values for the proxy, when the framework knows them better
	 * than the request does (SvelteKit `event.getClientAddress()`). Defaults
	 * to the request URL, plus the forwarding headers under
	 * `trustForwardedHeaders`.
	 */
	forwarding?: () => ConsentProxyForwarding;
	/**
	 * Resolver inputs the adapter already derived, such as a middleware's
	 * normalized geo or a configured locale. Defaults to the request headers.
	 */
	inputs?: ResolveInitFromManifestInputs;
}

/** A consent route: Web `Request` in, `Response` out. */
export type ConsentRouteHandler = (
	request: Request,
	context?: ConsentRouteRequestContext
) => Promise<Response>;

/** How a resolution reports itself to `POST /v1/consent/sessions`. */
export interface ConsentInitReport {
	/** Package name of the adapter. */
	adapter: string;
	/** Absolute backend URL as configured; anything else sends no report. */
	projectUrl: string | undefined;
	/** Where the resolution happened. */
	source: ConsentSessionSource;
	/** The visitor's request headers; only IP and user agent travel. */
	headers: Headers;
	/** The request's method, when there is one; only a `GET` is reported. */
	method?: string;
	/** Fetch for the report. */
	fetch?: typeof globalThis.fetch;
	/** Keeps the detached report alive. */
	waitUntil?: (task: Promise<void>) => void;
	/**
	 * Whether the caller stopped waiting for this resolution, checked just
	 * before the report goes out. A render or request that gave up leaves
	 * the browser to resolve the view again, and that resolution reports it.
	 */
	abandoned?: () => boolean;
	/** The experiment arm a server render ran, while there is no choice. */
	experiment?: { id: string; arm: string };
	/**
	 * The consent journey a server render created. An init route leaves it
	 * out and passes {@link ConsentInitReport.url}: the browser sends its
	 * journey as query parameters.
	 */
	journey?: SessionJourney;
	/** The browser's request URL, which may carry its consent journey. */
	url?: string;
}

/** Input for {@link resolveConsentInit}. */
export interface ResolveConsentInitOptions {
	/** The manifest to resolve against. */
	manifest: ConsentManifest;
	/** Geo, language and GPC for this visitor. */
	inputs: ResolveInitFromManifestInputs;
	/**
	 * Loads the vendor list in a language. Called only when the manifest
	 * enables IAB, names a list, and the resolved policy is the IAB model.
	 * A rejection rejects the resolution.
	 */
	loadGvl?: (language: string) => Promise<GlobalVendorList | null>;
	/**
	 * Loads Google Additional Consent providers. Called only when the
	 * manifest enables IAB, lists providers, and the resolved policy is the
	 * IAB model. `undefined` leaves the field out; a rejection does too,
	 * because the Additional Consent string only supplements the TC String.
	 */
	loadAdTechProviders?: (
		reference: ConsentManifestAdditionalConsent
	) => Promise<AdTechProvider[] | undefined>;
	/** Session report to send once resolved. Absent means none. */
	report?: ConsentInitReport;
}

/**
 * Whenever the resolution is not `matched`, removes every field that only a
 * matched policy may carry (`policySnapshotToken`, `gvl`, `gvlReference`,
 * `cmpId`, `customVendors`, `adTechProviders`), so no stale proof travels
 * with the outcome.
 */
const withoutUnmatchedProof = function withoutUnmatchedProof(
	output: InitOutput
): InitOutput {
	const negotiated = { ...output };
	if (negotiated.policyResolution?.status !== 'matched') {
		delete negotiated.policySnapshotToken;
		delete negotiated.gvl;
		delete negotiated.gvlReference;
		delete negotiated.cmpId;
		delete negotiated.customVendors;
		delete negotiated.adTechProviders;
	}
	return negotiated;
};

const isIabMatch = function isIabMatch(
	manifest: ConsentManifest,
	payload: InitOutput
): boolean {
	return (
		manifest.iab?.enabled === true &&
		manifest.iab.gvl !== undefined &&
		payload.policyResolution?.status === 'matched' &&
		payload.policyResolution.policy.model === 'iab'
	);
};

/**
 * Resolves one visitor's init from a manifest: the policy, translations
 * and overrides for the inputs, the vendor list for an IAB policy, and a
 * detached session report.
 *
 * The init route uses this, and so can a server render that resolves from
 * the same manifest. `resolvedOverrides` and `resolvedPrivacySignals` echo
 * the inputs back, because the resolver's inputs are the only place GPC
 * survives on a server-rendered page.
 *
 * @param options - Manifest, inputs, vendor-list loader and report target.
 * @returns The resolved init payload, with the vendor list inline.
 * @throws {Error} When `loadGvl` rejects: a vendor list that could not be loaded is
 * a failed resolution, not `gvl: null`, which a client reads as "IAB is
 * off".
 * @example
 * ```ts
 * const init = await resolveConsentInit({ inputs, manifest });
 * ```
 */
export const resolveConsentInit = async function resolveConsentInit(
	options: ResolveConsentInitOptions
): Promise<InitOutput> {
	const { inputs, manifest } = options;
	const payload = withoutUnmatchedProof(
		resolveManifestInit({ inputs, manifest })
	);
	// Loaded beside the vendor list, never failing the resolution.
	const { loadAdTechProviders } = options;
	const providers = loadManifestAdTechProviders(
		manifest,
		payload,
		async (reference) => {
			try {
				return await loadAdTechProviders?.(reference);
			} catch {
				return undefined;
			}
		}
	);
	if (options.loadGvl && isIabMatch(manifest, payload)) {
		payload.gvl = await options.loadGvl(
			primaryLanguage(payload.translations.language) ?? 'en'
		);
	}
	const adTechProviders = await providers;
	if (adTechProviders) {
		payload.adTechProviders = adTechProviders;
	}
	const { report } = options;
	if (report && !report.abandoned?.()) {
		reportV1ConsentSession({
			adapter: report.adapter,
			experiment: report.experiment,
			fetch: report.fetch,
			headers: report.headers,
			init: payload,
			inputs,
			journey: report.journey,
			manifest,
			method: report.method,
			projectUrl: report.projectUrl,
			source: report.source,
			url: report.url,
			waitUntil: report.waitUntil,
		});
	}
	return payload;
};

/**
 * Reads a platform's `waitUntil` from the object that carries it (Nitro's
 * event, SvelteKit's `platform.context`, Cloudflare's execution context),
 * bound to that object.
 *
 * @param holder - Anything that may have a `waitUntil` method.
 * @returns The bound function, or `undefined` when there is none.
 */
export const readWaitUntil = function readWaitUntil(
	holder: unknown
): ((task: Promise<unknown>) => void) | undefined {
	const waitUntil = (holder as { waitUntil?: unknown } | null | undefined)
		?.waitUntil;
	return typeof waitUntil === 'function'
		? (task) => {
				(waitUntil as (task: Promise<unknown>) => void).call(holder, task);
			}
		: undefined;
};

const lastSegment = function lastSegment(pathname: string): string {
	const trimmed = trimPathSlashes(pathname);
	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
};

/**
 * The validated `language` query for the upstream manifest request, or
 * `undefined`. It is the only parameter forwarded: the value keys the
 * shared manifest cache, and a visitor's raw query must neither reach the
 * backend nor mint cache entries.
 */
const readLanguageQuery = function readLanguageQuery(
	url: URL
): string | undefined {
	const raw = url.searchParams.get('language');
	if (!raw) {
		return undefined;
	}
	const language = raw.trim().toLowerCase();
	return LANGUAGE_TAG.test(language) ? `language=${language}` : undefined;
};

/**
 * The budget a server render asked for with
 * {@link CONSENT_ROUTE_TIMEOUT_HEADER}, or `undefined`.
 */
const readTimeoutMs = function readTimeoutMs(
	value: string | null
): number | undefined {
	const trimmed = value?.trim();
	if (!trimmed || !/^\d+$/u.test(trimmed)) {
		return undefined;
	}
	return Math.min(Number.parseInt(trimmed, 10), MAX_ROUTE_TIMEOUT_MS);
};

/**
 * What is left of the request's budget. Every upstream wait (manifest,
 * vendor list, `/v1/consent/init` fallback) fits in the same budget.
 */
const createBudget = function createBudget(budgetMs: number | undefined) {
	const startedAt = Date.now();
	const remaining = (): number | undefined =>
		budgetMs === undefined ? undefined : budgetMs - (Date.now() - startedAt);
	return {
		bound: <Value>(task: Promise<Value>): Promise<Value> =>
			withResolutionBudget(task, remaining()),
		budgetMs,
		expired: (): boolean => {
			const left = remaining();
			return left !== undefined && left <= 0;
		},
		remaining,
	};
};

type Budget = ReturnType<typeof createBudget>;

const isBudgetTimeout = function isBudgetTimeout(error: unknown): boolean {
	return (
		error instanceof ManifestUnavailableError && error.reason === 'timeout'
	);
};

/** A configured URL and the fetch that reaches it. */
interface ResolvedTarget {
	url: string;
	fetch: ManifestFetch | undefined;
	/** Set when `url` is an {@link IN_PROCESS_ORIGIN} URL for `localFetch`. */
	inProcess?: true;
}

/**
 * The hop chain for a proxied request when the adapter supplies none.
 * Without `trustForwardedHeaders` the forwarding headers are
 * client-controlled and a `Request` has no socket address to check them
 * against, so only the request URL is believed and no client IP is sent.
 * Its `proto` and `host` are the site's origin as the visitor sees it,
 * from {@link resolveRequestOrigin}: the one origin the handler resolves a
 * relative backend URL against, `forwarded` and the first value of each
 * `x-forwarded-*` list included. Shared with the framework adapters'
 * consent routes. An adapter that has
 * the socket passes its address as `peer`: the client without trusted
 * headers, else the last hop, appended to the trusted chain.
 *
 * @param trustForwardedHeaders - Believe `x-forwarded-*` headers.
 * @param peer - The socket's remote address, when the adapter has one.
 * @returns The forwarding the proxy sends on.
 * @internal
 */
export const readRequestForwarding = function readRequestForwarding(
	request: Request,
	trustForwardedHeaders: boolean,
	peer?: string
): ConsentProxyForwarding {
	const origin = new URL(
		resolveRequestOrigin({
			headers: request.headers,
			requestUrl: request.url,
			trustForwardedHeaders,
		}) ?? request.url
	);
	const { host } = origin;
	const proto = origin.protocol.slice(0, -1);
	if (!trustForwardedHeaders) {
		return peer ? { for: peer, host, proto } : { host, proto };
	}
	// Unmasked on purpose: the WAF needs the real address to rate-limit and
	// score the visitor, and the backend masks before it stores anything.
	const clientIp = getIpAddress(request.headers, { masking: false });
	const chain = (request.headers.get('x-forwarded-for') ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	if (clientIp && !chain.includes(clientIp)) {
		chain.push(clientIp);
	}
	if (peer && !chain.includes(peer)) {
		chain.push(peer);
	}
	return {
		for: chain.length > 0 ? chain.join(', ') : undefined,
		host,
		proto,
	};
};

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/**
 * `manifest` as a browser of `level` gets it from the manifest route: a
 * static manifest or a site's `manifestUrl` was filtered for no level, and
 * an SDK from before manifest levels refuses `requires` of any value.
 */
const manifestForLevel = function manifestForLevel(
	manifest: ConsentManifest,
	level: number
): ConsentManifest {
	const scriptRegistry = registryForManifestLevel(
		manifest.scriptRegistry,
		level
	);
	return scriptRegistry === manifest.scriptRegistry
		? manifest
		: { ...manifest, scriptRegistry };
};

/**
 * The country, region and GPC overrides a browser's `/v1/consent/init` carries as
 * query parameters, leaving out any it did not send.
 */
const queryOverrides = function queryOverrides(
	url: URL
): Partial<ResolveInitFromManifestInputs> {
	const { country, gpc, region } = extractConsentRequestInputs(
		applyInitParamsToHeaders(url, new Headers())
	);
	return {
		...(country && { country }),
		...(gpc !== undefined && { gpc }),
		...(region && { region }),
	};
};

/**
 * Creates the consent route handler an adapter mounts.
 *
 * Nothing is read from the environment, and the configured URLs are
 * resolved per request, so a missing or invalid URL fails the request
 * (the handler throws) rather than the build.
 *
 * @param options - Upstream location, fetch seams, reporting and proxy.
 * @returns One handler for every consent route. Upstream failures reject:
 * a manifest that cannot be read (after the `/v1/consent/init` fallback, when a
 * `projectUrl` allows one), a vendor list that cannot be loaded, or a
 * request budget that runs out.
 * @throws {Error} From the handler, when neither `projectUrl` nor
 * `manifestUrl` is set, or one cannot be resolved.
 * @throws {TypeError} When a relative `projectUrl` or `manifestUrl` is on
 * or beneath `routePrefix`.
 * @example
 * ```ts
 * const handle = createConsentRouteHandler({
 *   adapter: '@inth/example',
 *   projectUrl: 'https://consent.example.com',
 * });
 * export const GET = (request: Request) => handle(request, { route: 'init' });
 * ```
 */
export const createConsentRouteHandler = function createConsentRouteHandler(
	options: ConsentRouteHandlerOptions
): ConsentRouteHandler {
	const { adapter } = options;
	const upstreams = readUpstreams(options);
	if (options.routePrefix !== undefined) {
		const loop = relativeLoop(upstreams, options.routePrefix);
		if (loop) {
			throw new TypeError(`${adapter}: ${loop}`);
		}
	}
	const proxy = resolveConsentProxyOptions(options.proxy);
	const extraForwardHeaders =
		typeof options.proxy === 'object'
			? (options.proxy.forwardHeaders ?? []).map((name) => name.toLowerCase())
			: [];
	const trustForwardedHeaders = options.trustForwardedHeaders === true;
	const configuredFetch = function configuredFetch(): typeof globalThis.fetch {
		return (options.fetch ??
			globalThis.fetch.bind(globalThis)) as typeof globalThis.fetch;
	};

	const resolveTarget = function resolveTarget(
		url: string,
		request: Request,
		context: ConsentRouteRequestContext
	): ResolvedTarget | null {
		if (context.localFetch && url.startsWith('/') && !url.startsWith('//')) {
			const resolved = resolveRequestProjectUrl(url, {
				requestUrl: IN_PROCESS_ORIGIN,
			});
			return resolved
				? {
						fetch: toPathFetch(context.localFetch),
						inProcess: true,
						url: resolved,
					}
				: null;
		}
		const resolved = resolveRequestProjectUrl(url, {
			headers: request.headers,
			requestUrl: request.url,
			trustForwardedHeaders,
		});
		return resolved ? { fetch: options.fetch, url: resolved } : null;
	};

	const resolveBackend = function resolveBackend(
		request: Request,
		context: ConsentRouteRequestContext,
		projectUrl: string
	): ResolvedTarget {
		const backend = resolveTarget(projectUrl, request, context);
		if (!backend) {
			throw new Error(`${adapter}: invalid projectUrl.`);
		}
		return backend;
	};

	/**
	 * Where the manifest comes from. The backend's manifest is asked for at
	 * the browser's `level`, since the browser runs the scripts it lists; a
	 * site's own `manifestUrl` is fetched as given.
	 */
	const resolveManifestSource = function resolveManifestSource(
		request: Request,
		context: ConsentRouteRequestContext,
		level: number
	): ResolvedTarget {
		if (options.manifestUrl) {
			const source = resolveTarget(options.manifestUrl, request, context);
			if (!source) {
				throw new Error(`${adapter}: invalid manifestUrl.`);
			}
			return source;
		}
		if (!options.projectUrl) {
			throw new Error(`${adapter}: pass projectUrl or manifestUrl.`);
		}
		const backend = resolveBackend(request, context, options.projectUrl);
		return {
			...backend,
			url: appendInitParams(`${backend.url}${V1_ROUTES.manifest}`, {
				manifestLevel: level,
			}),
		};
	};

	/**
	 * Credentials for the manifest request when the proxy is on: the cookies
	 * `cookieNames` names and the extra `forwardHeaders`, so a backend that
	 * gates `/v1/consent/manifest` on them still serves it. Hop-chain headers are never
	 * copied from the browser. Nothing identity-bearing crosses cleartext.
	 */
	const manifestCredentials = function manifestCredentials(
		request: Request,
		sourceUrl: string
	): Record<string, string> | undefined {
		if (!proxy) {
			return undefined;
		}
		const headers: Record<string, string> = {};
		const cookie = request.headers.get('cookie');
		const scoped =
			cookie && proxy.cookieNames
				? filterCookieHeader(cookie, proxy.cookieNames)
				: undefined;
		if (scoped) {
			headers.cookie = scoped;
		}
		for (const name of extraForwardHeaders) {
			if (name === 'cookie' || CONSENT_PROXY_FORWARDING_HEADERS.has(name)) {
				continue;
			}
			const value = request.headers.get(name);
			if (value) {
				headers[name] = value;
			}
		}
		return stripIdentityForCleartext(
			Object.keys(headers).length > 0 ? headers : undefined,
			sourceUrl
		);
	};

	const readManifest = async function readManifest(
		request: Request,
		context: ConsentRouteRequestContext,
		source: ResolvedTarget,
		budget: Budget | undefined,
		query: string | undefined
	): Promise<{
		cached: CachedManifestResponse;
		credentials: Record<string, string> | undefined;
	}> {
		const credentials = manifestCredentials(request, source.url);
		const cached = await fetchCachedManifest({
			cache: options.cache,
			fetch: source.fetch,
			headers: credentials,
			init: options.manifestFetchInit,
			onBackgroundRevalidate: context.waitUntil,
			query,
			sourceUrl: source.url,
			timeoutMs: budget?.remaining(),
		});
		return { cached, credentials };
	};

	const serveManifest = async function serveManifest(
		request: Request,
		url: URL,
		context: ConsentRouteRequestContext
	): Promise<Response> {
		// A browser that sends no level runs level 1.
		const level = readManifestLevelParam(url) ?? 1;
		if (options.manifest) {
			return Response.json(manifestForLevel(options.manifest, level));
		}
		const { cached, credentials } = await readManifest(
			request,
			context,
			resolveManifestSource(request, context, level),
			undefined,
			readLanguageQuery(url)
		);
		const manifest = manifestForLevel(cached.manifest, level);
		const headers = new Headers({ 'content-type': 'application/json' });
		for (const name of MANIFEST_PASSTHROUGH_HEADERS) {
			const value = cached.headers[name];
			if (value) {
				headers.set(name, value);
			}
		}
		if (credentials) {
			// The in-process cache is partitioned by these credentials; a shared
			// cache in front of this route is keyed by URL only, so it must not
			// reuse a credentialed manifest for the next visitor.
			markResponsePrivate(headers);
			return new Response(JSON.stringify(manifest), { headers });
		}
		// Downstream caches count the remaining lifetime, not a fresh TTL.
		headers.set('age', String(getManifestAge(cached)));
		const { etag } = cached.headers;
		if (etag && request.headers.get('if-none-match') === etag) {
			return new Response(null, { headers, status: 304 });
		}
		return new Response(JSON.stringify(manifest), { headers });
	};

	const createGvlLoader = function createGvlLoader(
		manifest: ConsentManifest,
		budget: Budget,
		context: ConsentRouteRequestContext
	): (language: string) => Promise<GlobalVendorList | null> {
		const reference = manifest.iab?.gvl;
		return async function loadGvl(language) {
			if (!reference) {
				return null;
			}
			const fill = options.fetchGvl
				? options.fetchGvl({ fetch: configuredFetch(), language, reference })
				: fetchServerGvl({
						fetch: options.fetch,
						headers: inthProtocolHeaders,
						label: adapter,
						language,
						url: reference.url,
					});
			if (budget.budgetMs === undefined) {
				return await fill;
			}
			try {
				return await budget.bound(fill);
			} catch (error) {
				if (isBudgetTimeout(error)) {
					// Let the list finish filling the cache for the next request.
					keepAlive(context.waitUntil, fill);
				}
				throw error;
			}
		};
	};

	// Every app's in-process URLs share one origin, so lists fetched through
	// `localFetch` stay out of the cache other handlers in the process read.
	const inProcessProviderCache: AdTechProviderCache = new Map();

	const createAdTechProviderLoader = function createAdTechProviderLoader(
		request: Request,
		budget: Budget,
		context: ConsentRouteRequestContext
	): NonNullable<ResolveConsentInitOptions['loadAdTechProviders']> {
		return async function loadAdTechProviders(reference) {
			// A relative endpoint is this app's own route, which the global
			// fetch cannot reach without an origin.
			const target = resolveTarget(reference.url, request, context);
			if (!target) {
				return undefined;
			}
			const fill = fetchCachedAdTechProviders({
				...(target.inProcess && { cache: inProcessProviderCache }),
				fetch: (target.fetch ?? configuredFetch()) as typeof globalThis.fetch,
				headers: inthProtocolHeaders,
				reference: { ...reference, url: target.url },
			});
			if (budget.budgetMs === undefined) {
				return await fill;
			}
			try {
				return await budget.bound(fill);
			} catch (error) {
				if (isBudgetTimeout(error)) {
					// Let the list finish filling the cache for the next request.
					keepAlive(context.waitUntil, fill);
				}
				return undefined;
			}
		};
	};

	const initHeaders = { 'cache-control': INIT_CACHE_CONTROL };

	/**
	 * When the manifest is unavailable (an error, or a source backing off
	 * after one), ask the backend's init and warn once. Forwards only the
	 * consent request headers (geo, language, GPC) and the browser's consent
	 * journey, and rebuilds the canonical output from its answer so unknown
	 * upstream fields cannot carry stale policy evidence.
	 */
	const fallBackToBackendInit = async function fallBackToBackendInit(
		request: Request,
		context: ConsentRouteRequestContext,
		budget: Budget,
		cause: unknown,
		manifestUrl: string,
		level: number | undefined
	): Promise<Response> {
		// A timeout means the budget ran out: there is no time left to ask.
		if (!options.projectUrl || options.manifest || isBudgetTimeout(cause)) {
			throw cause;
		}
		if (budget.expired()) {
			throw new ManifestUnavailableError(
				'timeout',
				`inth: consent resolution did not finish within ${budget.budgetMs} ms.`,
				{ cause }
			);
		}
		warnManifestFallback(manifestUrl, cause);
		const backend = resolveBackend(request, context, options.projectUrl);
		const forward: Record<string, string> = {};
		for (const name of CONSENT_REQUEST_HEADER_NAMES) {
			const value = request.headers.get(name);
			if (value) {
				forward[name] = value;
			}
		}
		// The backend's own session report then carries the journey, with
		// the page's origin: a server fetch sends no Origin of its own, and
		// the backend's host is not the site's.
		const journey = readJourneyParams(request.url);
		if (journey) {
			const origin = request.headers.get('origin');
			forward.origin =
				origin && origin !== 'null' ? origin : new URL(request.url).origin;
		}
		const init: RequestInit = { headers: forward };
		const left = budget.remaining();
		if (left !== undefined) {
			// Cancels a real request; the race below covers an in-process
			// fetch that drops the signal.
			init.signal = AbortSignal.timeout(Math.max(0, left));
		}
		const fetchImpl = backend.fetch ?? configuredFetch();
		const payload = await budget.bound(
			(async () => {
				// The browser's level, not this route's: the browser runs the
				// scripts the answer lists.
				const plain = appendInitParams(`${backend.url}${V1_ROUTES.init}`, {
					manifestLevel: level,
				});
				const upstream = await fetchImpl(
					journey ? appendJourneyParams(plain, journey) : plain,
					init
				);
				if (!upstream.ok) {
					throw cause;
				}
				return (await upstream.json()) as InitOutput;
			})()
		);
		const mapped = mapInitOutputToInitResponse(payload, forward, {
			producerContract: POLICY_CONTRACT_VERSION,
		});
		const output: InitOutput = {
			adTechProviders: mapped.adTechProviders,
			branding: payload.branding,
			cmpId: mapped.cmpId,
			customVendors: mapped.customVendors,
			gvl: mapped.gvl,
			gvlReference: mapped.gvlReference,
			hosting: mapped.hosting,
			location: payload.location,
			policyResolution: writePolicyResolutionWire(
				readPolicyResolutionWire(mapped.policyResolution)
			),
			policySnapshotToken: mapped.policySnapshotToken,
			resolvedPrivacySignals: mapped.resolvedPrivacySignals,
			// The backend may list entries for another level, or not filter at
			// all; the browser refuses any above its own.
			scriptRegistry: registryForManifestLevel(
				mapped.scriptRegistry,
				level ?? 1
			),
			subjectId: mapped.subjectId,
			translations: payload.translations,
			vendorListVersion: mapped.vendorListVersion,
			vendors: mapped.vendors,
		} as InitOutput;
		return Response.json(withoutUnmatchedProof(output), {
			headers: initHeaders,
		});
	};

	const serveInit = async function serveInit(
		incoming: Request,
		url: URL,
		context: ConsentRouteRequestContext
	): Promise<Response> {
		// A browser sends its overrides and experiment arm as query
		// parameters, so a cross-origin init needs no preflight.
		// Folded onto their header names, every reader below, the backend
		// fallback and the session report see one set of inputs.
		// Copy the fields instead of passing `incoming` as the input: the App
		// Router hands route handlers a Proxy of the request, and Node 24's
		// `Request` constructor reads the input's private fields, which a
		// Proxy does not forward. `/v1/consent/init` is GET or HEAD, so it has no body.
		const request = INIT_PARAM_HEADERS.some(([param]) =>
			url.searchParams.has(param)
		)
			? new Request(incoming.url, {
					headers: applyInitParamsToHeaders(url, incoming.headers),
					method: incoming.method,
					signal: incoming.signal,
				})
			: incoming;
		const budget = createBudget(
			readTimeoutMs(request.headers.get(CONSENT_ROUTE_TIMEOUT_HEADER))
		);
		// The browser's level, not this route's: the browser runs the scripts
		// the answer lists. One that sends none runs level 1.
		const sentLevel = readManifestLevelParam(url);
		const level = sentLevel ?? 1;
		let manifest: ConsentManifest;
		if (options.manifest) {
			({ manifest } = options);
		} else {
			// Outside the fallback: a misconfigured source is an error, not a
			// reason to ask the backend's `/v1/consent/init` instead.
			const source = resolveManifestSource(request, context, level);
			try {
				({
					cached: { manifest },
				} = await readManifest(request, context, source, budget, undefined));
			} catch (cause) {
				return await fallBackToBackendInit(
					request,
					context,
					budget,
					cause,
					source.url,
					sentLevel
				);
			}
		}
		const loadGvl = createGvlLoader(manifest, budget, context);
		const listResponse = await serveGvlReference(request, loadGvl);
		if (listResponse) {
			return listResponse;
		}
		const inputs = {
			...(context.inputs
				? {
						...context.inputs,
						// Inputs an adapter resolved from the request headers miss the
						// overrides a browser sends in the query string; those win,
						// as the `x-inth-*` override headers did.
						...queryOverrides(url),
						language: context.inputs.language ?? 'en',
					}
				: getResolverInputsFromHeaders(request.headers)),
			manifestLevel: level,
		};
		const payload = await resolveConsentInit({
			inputs,
			loadAdTechProviders: createAdTechProviderLoader(request, budget, context),
			loadGvl,
			manifest,
			report: {
				// A request that went away is a render that stopped
				// waiting; the browser inits again and reports the view.
				abandoned: () => request.signal.aborted,
				adapter,
				fetch: options.fetch as typeof globalThis.fetch | undefined,
				headers: request.headers,
				method: request.method,
				projectUrl: options.projectUrl,
				source: 'route',
				url: request.url,
				waitUntil: context.waitUntil,
			},
		});
		return Response.json(deferInitGvlToRoute(payload, url.pathname), {
			headers: initHeaders,
		});
	};

	const serveProxy = function serveProxy(
		request: Request,
		context: ConsentRouteRequestContext,
		path: string
	): Promise<Response> {
		if (!proxy) {
			// Without the proxy the route only reads.
			return Promise.resolve(
				READ_METHODS.has(request.method.toUpperCase())
					? notFound()
					: new Response(null, {
							headers: { allow: 'GET, HEAD' },
							status: 405,
						})
			);
		}
		if (!options.projectUrl) {
			throw new Error(`${adapter}: pass projectUrl to use proxy.`);
		}
		const backend = resolveBackend(request, context, options.projectUrl);
		return forwardConsentRequest({
			adapter,
			fetch: backend.fetch as typeof globalThis.fetch | undefined,
			forwarding: context.forwarding
				? context.forwarding()
				: readRequestForwarding(request, trustForwardedHeaders),
			options: proxy,
			path,
			projectUrl: backend.url,
			request,
		});
	};

	const dispatch = function dispatch(
		request: Request,
		context: ConsentRouteRequestContext
	): Promise<Response> {
		const url = new URL(request.url);
		const path =
			context.path === undefined
				? lastSegment(url.pathname)
				: trimPathSlashes(context.path);
		let { route } = context;
		if (route === undefined) {
			const readable = READ_METHODS.has(request.method.toUpperCase());
			if (
				readable &&
				path === (context.path === undefined ? 'manifest' : MANIFEST_PATH)
			) {
				route = 'manifest';
			} else if (
				readable &&
				(context.path === undefined || path === '' || path === INIT_PATH)
			) {
				route = 'init';
			} else {
				route = 'proxy';
			}
		}
		switch (route) {
			case 'manifest':
				return serveManifest(request, url, context);
			case 'init':
				return serveInit(request, url, context);
			default:
				return serveProxy(request, context, path);
		}
	};

	/**
	 * Why this request's upstream would lead back into the route, or
	 * `undefined`.
	 */
	const loopFor = function loopFor(
		request: Request,
		context: ConsentRouteRequestContext
	): string | undefined {
		if (upstreams.length === 0) {
			return undefined;
		}
		const mount =
			options.routePrefix ??
			(context.path === undefined
				? undefined
				: mountOf(new URL(request.url).pathname, context.path));
		if (mount === undefined) {
			return undefined;
		}
		// The site's origin as the route sees it, forwarded headers included
		// when it trusts them.
		const site = context.forwarding
			? context.forwarding()
			: readRequestForwarding(request, trustForwardedHeaders);
		return requestLoop(upstreams, mount, site);
	};

	return async (request, context = {}) => {
		const loop = loopFor(request, context);
		if (loop) {
			return Response.json({ error: `${adapter}: ${loop}` }, { status: 500 });
		}
		const work = dispatch(request, context);
		const { waitUntil } = context;
		if (!waitUntil) {
			return await work;
		}
		// A client that goes away (a server render out of budget, a closed
		// tab) stops waiting; edge runtimes would then drop a cold manifest
		// fill the next request needs, so the rest goes to the platform.
		const { signal } = request;
		const onAbort = () => keepAlive(waitUntil, work);
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			return await work;
		} finally {
			signal.removeEventListener('abort', onAbort);
		}
	};
};
