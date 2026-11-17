/**
 * The same-origin consent route for an Angular server.
 *
 * The route logic lives in `@c15t/core/server` (`createConsentRouteHandler`),
 * shared with every other adapter. This module mounts it under a path
 * prefix in front of `AngularAppEngine` or `AngularNodeAppEngine`, and lets
 * `provideC15tServer()` reach it in-process.
 */
import {
	createConsentRouteHandler,
	normalizeRoutePrefix,
	readRequestForwarding,
	resolveRequestOrigin,
} from '@c15t/core/server';
import type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
	ConsentRouteFetchGvl,
	ConsentRouteRequestContext,
	ManifestFetch,
} from '@c15t/core/server';
import type { ConsentManifest } from '@c15t/schema/types';

export type { ConsentProxyOptions } from '@c15t/core/server';

const ADAPTER = '@c15t/angular';

/** Options for {@link createConsentRoute}. */
export interface ConsentRouteOptions {
	/**
	 * Where the route is mounted. Requests below it are consent requests.
	 *
	 * @default '/api/c15t'
	 */
	routePrefix?: string;
	/**
	 * The c15t backend. The manifest is read from `${backendURL}/manifest`
	 * unless `manifestURL` or `snapshot` is set; session reports and the
	 * proxy go here. Must not name this route.
	 */
	backendURL?: string;
	/** Full manifest URL. Takes precedence over `${backendURL}/manifest`. */
	manifestURL?: string;
	/** A manifest to resolve with. No manifest is fetched. */
	snapshot?: ConsentManifest;
	/** Fetch for an absolute `backendURL` or `manifestURL`. */
	fetch?: ManifestFetch;
	/** Fetches the Global Vendor List when the resolved policy is IAB. */
	fetchGvl?: ConsentRouteFetchGvl;
	/**
	 * Report each init the route resolves to the backend's `POST /sessions`.
	 * Needs an absolute `backendURL`.
	 *
	 * @default true
	 */
	reportSessions?: boolean;
	/**
	 * Resolve a relative `backendURL` against the request's forwarding
	 * headers and believe the client IP chain. Only behind a proxy that sets
	 * those headers and drops incoming ones.
	 *
	 * @default false
	 */
	trustForwardedHeaders?: boolean;
	/**
	 * Forward consent writes to `backendURL` through this route, so the
	 * browser only talks to this origin. Without it the route answers `GET`
	 * only and anything else gets `405`. Only an allowlist of paths is
	 * forwarded, so the route is never an open proxy.
	 *
	 * @default false
	 */
	proxy?: boolean | ConsentProxyOptions;
	/**
	 * Keeps detached work (manifest refreshes, session reports) alive past
	 * the response, on runtimes that stop it once a response is sent.
	 */
	waitUntil?: (task: Promise<void>) => void;
}

/** A Node request, as `node:http` and Express hand it to middleware. */
export interface NodeRequest {
	readonly method?: string;
	readonly url?: string;
	readonly originalUrl?: string;
	readonly socket?: { readonly remoteAddress?: string };
}

/** A Node response, as `node:http` and Express hand it to middleware. */
export interface NodeResponse {
	statusCode: number;
	readonly headersSent: boolean;
}

/**
 * Connect- and Express-style middleware. It settles once the response is
 * written or `next()` is called, and never rejects: errors go to `next`.
 */
export type NodeMiddleware = (
	request: NodeRequest,
	response: NodeResponse,
	next: (error?: unknown) => void
) => Promise<void>;

/** The consent route {@link createConsentRoute} returns. */
export interface ConsentRoute {
	/** Where the route is mounted, without a trailing slash. */
	readonly routePrefix: string;
	/**
	 * Answers a consent request: a `Request` below {@link routePrefix}.
	 *
	 * @param request - Any request the server receives.
	 * @returns The response, or `null` when the request is not below
	 * {@link routePrefix}, so the server renders the page instead.
	 */
	readonly fetch: (request: Request) => Promise<Response | null>;
	/**
	 * Fetch that answers this route in-process for a `/`-relative path
	 * below {@link routePrefix}, and `globalThis.fetch` for anything else.
	 * `provideC15tServer({ route })` resolves a backend on this route
	 * through it.
	 */
	readonly localFetch: ManifestFetch;
	/**
	 * {@link localFetch} for one incoming request: the in-process request
	 * carries that request's site origin, as `resolveRequestOrigin` reads
	 * it, and its forwarding headers when the route trusts them, so a
	 * `/`-relative upstream outside the route resolves on the real site.
	 * `provideC15tServer({ route })` uses it with Angular's `REQUEST`.
	 *
	 * @param request - The request being rendered, or `null` for none.
	 * @returns The fetch.
	 */
	readonly localFetchFor: (
		request: Pick<Request, 'headers' | 'url'> | null
	) => ManifestFetch;
	/**
	 * Node middleware for Express or `node:http`: answers consent requests
	 * and calls `next()` for the rest. Uses `@angular/ssr/node` to convert
	 * the request and write the response.
	 */
	readonly node: NodeMiddleware;
}

/** The path below the prefix, or `undefined` when outside it. */
const pathBelow = function pathBelow(
	pathname: string,
	prefix: string
): string | undefined {
	if (pathname === prefix) {
		return '';
	}
	if (!pathname.startsWith(`${prefix}/`)) {
		return undefined;
	}
	let start = prefix.length;
	let end = pathname.length;
	while (start < end && pathname[start] === '/') {
		start += 1;
	}
	while (end > start && pathname[end - 1] === '/') {
		end -= 1;
	}
	return pathname.slice(start, end);
};

const trimTrailingSlashes = (value: string): string => {
	let end = value.length;
	while (end > 1 && value[end - 1] === '/') {
		end -= 1;
	}
	return value.slice(0, end);
};

const READ_METHODS = new Set(['GET', 'HEAD']);

/** The origin of an in-process request with no incoming request to copy. */
const IN_PROCESS_ORIGIN = 'http://c15t.local';

/** Headers an in-process request carries when the route trusts them. */
const FORWARDING_HEADERS = [
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	'x-forwarded-ssl',
] as const;

/** Whether `pathname` is `prefix` or below it, on a segment boundary. */
const onOrBelow = (pathname: string, prefix: string): boolean => {
	const path = trimTrailingSlashes(pathname);
	return path === prefix || path.startsWith(`${prefix}/`);
};

/** Whether a URL names its own origin (`https://…`, `//…`). */
const isAbsolute = (url: string): boolean =>
	/^[a-z][a-z\d+.-]*:/iu.test(url) || url.startsWith('//');

/** Resolves a relative URL's path, `..` segments included. */
const RELATIVE_BASE = 'http://c15t.invalid';

/**
 * The upstream URLs that would send the route's requests back into it.
 * A relative one always does, so it is rejected at setup. An absolute one
 * does only when the site itself serves it, which the route learns per
 * request: those come back as origins to check against each request. A
 * protocol-relative one (`//host/…`) comes back as `//host`, which takes
 * each request's own scheme.
 *
 * @throws {TypeError} When a relative `backendURL` or `manifestURL` is the
 * route or beneath it.
 */
const upstreamLoops = function upstreamLoops(
	options: ConsentRouteOptions,
	routePrefix: string
): string[] {
	const origins: string[] = [];
	for (const [name, url] of [
		['backendURL', options.backendURL],
		['manifestURL', options.manifestURL],
	] as const) {
		if (!url) {
			continue;
		}
		const absolute = isAbsolute(url);
		const protocolRelative = url.startsWith('//');
		// The scheme here only parses the URL; a protocol-relative one keeps
		// the request's own when it is checked.
		const resolved = absolute
			? new URL(protocolRelative ? `http:${url}` : url)
			: new URL(url, RELATIVE_BASE);
		if (!onOrBelow(resolved.pathname, routePrefix)) {
			continue;
		}
		if (!absolute) {
			throw new TypeError(
				`${ADAPTER}: \`${name}\` (${url}) is on or beneath the consent route (${routePrefix}), so the route would call itself. Pass the c15t backend's URL.`
			);
		}
		origins.push(protocolRelative ? `//${resolved.host}` : resolved.origin);
	}
	return origins;
};

/**
 * Creates the consent route for an Angular server: `/manifest` and `/init`
 * below `routePrefix`, resolved in-process, and with `proxy`, consent
 * writes forwarded to the backend.
 *
 * Mount it in front of the Angular engine in `server.ts`.
 *
 * @example
 * ```ts
 * // server.ts (Express, `AngularNodeAppEngine`)
 * import { createConsentRoute } from '@c15t/angular/ssr';
 *
 * export const consentRoute = createConsentRoute({
 *   backendURL: process.env['C15T_BACKEND_URL'],
 *   proxy: true,
 * });
 *
 * app.use(consentRoute.node);
 * ```
 *
 * ```ts
 * // A fetch-style server (`AngularAppEngine`)
 * const response =
 *   (await consentRoute.fetch(request)) ?? (await angularApp.handle(request));
 * ```
 *
 * @param options - Mount point, manifest source and proxy settings.
 * @returns The route, as a fetch handler, an in-process fetch, and Node
 * middleware.
 * @throws {TypeError} When `routePrefix` is `/` or not a path, or a
 * relative `backendURL` or `manifestURL` is the route or beneath it.
 */
export const createConsentRoute = function createConsentRoute(
	options: ConsentRouteOptions = {}
): ConsentRoute {
	const routePrefix = normalizeRoutePrefix(
		ADAPTER,
		options.routePrefix ?? '/api/c15t'
	);
	const loops = upstreamLoops(options, routePrefix);
	const handler = createConsentRouteHandler({
		adapter: ADAPTER,
		backendURL: options.backendURL,
		fetch: options.fetch,
		fetchGvl: options.fetchGvl,
		manifest: options.snapshot,
		manifestURL: options.manifestURL,
		proxy: options.proxy,
		reportSessions: options.reportSessions,
		trustForwardedHeaders: options.trustForwardedHeaders,
	});

	const answer = async function answer(
		request: Request,
		forwarding?: () => ConsentProxyForwarding
	): Promise<Response | null> {
		const url = new URL(request.url);
		const path = pathBelow(url.pathname, routePrefix);
		if (path === undefined) {
			return null;
		}
		// The site's origin as the handler sees it, forwarded headers
		// included when it trusts them.
		const site =
			forwarding?.() ??
			readRequestForwarding(request, options.trustForwardedHeaders === true);
		if (
			loops.includes(`${site.proto}://${site.host}`) ||
			loops.includes(`//${site.host}`)
		) {
			// An absolute upstream URL on this site, beneath this route: the
			// request would come back here.
			return new Response(
				`${ADAPTER}: \`backendURL\` or \`manifestURL\` points beneath the consent route on this site (${routePrefix}). Pass the c15t backend's URL.`,
				{ status: 500 }
			);
		}
		const read = READ_METHODS.has(request.method.toUpperCase());
		if (!(read || options.proxy)) {
			return new Response(null, {
				headers: { allow: 'GET, HEAD' },
				status: 405,
			});
		}
		const context: ConsentRouteRequestContext = {
			forwarding,
			path,
			route: read ? undefined : 'proxy',
			waitUntil: options.waitUntil,
		};
		return await handler(request, context);
	};

	/** In-process fetch with requests on `origin`, carrying `forwarded`. */
	const inProcessFetch =
		(origin: string, forwarded?: Headers): ManifestFetch =>
		async (input, init) => {
			const target = typeof input === 'string' ? input : String(input);
			if (
				target.startsWith('/') &&
				!target.startsWith('//') &&
				pathBelow(new URL(target, origin).pathname, routePrefix) !== undefined
			) {
				const headers = new Headers(init?.headers);
				for (const [name, value] of forwarded ?? []) {
					if (!headers.has(name)) {
						headers.set(name, value);
					}
				}
				const response = await answer(
					new Request(new URL(target, origin), { ...init, headers })
				);
				if (response) {
					return response;
				}
			}
			return await globalThis.fetch(input, init);
		};

	const localFetch = inProcessFetch(IN_PROCESS_ORIGIN);

	const localFetchFor: ConsentRoute['localFetchFor'] = (request) => {
		if (!request) {
			return localFetch;
		}
		const trust = options.trustForwardedHeaders === true;
		const origin =
			resolveRequestOrigin({
				headers: request.headers,
				requestURL: request.url,
				trustForwardedHeaders: trust,
			}) ?? IN_PROCESS_ORIGIN;
		const forwarded = new Headers();
		if (trust) {
			for (const name of FORWARDING_HEADERS) {
				const value = request.headers.get(name);
				if (value !== null) {
					forwarded.set(name, value);
				}
			}
		}
		return inProcessFetch(origin, forwarded);
	};

	const node: NodeMiddleware = async (request, response, next) => {
		const [pathname = '/'] = (request.originalUrl ?? request.url ?? '/').split(
			/[?#]/u
		);
		if (pathBelow(pathname, routePrefix) === undefined) {
			next();
			return;
		}
		try {
			const { createWebRequestFromNodeRequest, writeResponseToNodeResponse } =
				await import('@angular/ssr/node');
			const webRequest = createWebRequestFromNodeRequest(
				request as Parameters<typeof createWebRequestFromNodeRequest>[0]
			);
			// The core handler's own reading, with the socket as the peer: the
			// visitor without trusted headers, else the proxy in front.
			const answered = await answer(webRequest, () =>
				readRequestForwarding(
					webRequest,
					options.trustForwardedHeaders === true,
					request.socket?.remoteAddress
				)
			);
			if (!answered) {
				next();
				return;
			}
			await writeResponseToNodeResponse(
				answered,
				response as unknown as Parameters<typeof writeResponseToNodeResponse>[1]
			);
		} catch (error) {
			return next(error);
		}
	};

	return {
		fetch: (request) => answer(request),
		localFetch,
		localFetchFor,
		node,
		routePrefix,
	};
};
