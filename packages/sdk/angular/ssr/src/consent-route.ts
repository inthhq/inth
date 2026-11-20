/**
 * The same-origin consent route for an Angular server.
 *
 * The route logic lives in `@inth/sdk/server` (`createConsentRouteHandler`),
 * shared with every other adapter. This module mounts it under a path
 * prefix in front of `AngularAppEngine` or `AngularNodeAppEngine`, and lets
 * `provideInthServer()` reach it in-process.
 */
import type { InthOptions } from '@inth/angular';
import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	createConsentRouteHandler,
	DEFAULT_CONSENT_ROUTE_PREFIX,
	IN_PROCESS_ORIGIN,
	normalizeRoutePrefix,
	readRequestForwarding,
	resolveRequestOrigin,
	resolveServerMode,
	trimPathSlashes,
} from '@inth/sdk/server';
import type {
	ConsentProxyForwarding,
	ConsentProxyOptions,
	ConsentRouteFetchGvl,
	ManifestFetch,
	ServerModeInput,
} from '@inth/sdk/server';

export type { ConsentProxyOptions } from '@inth/sdk/server';

const ADAPTER = '@inth/angular';

/** Options for {@link createConsentRoute}. */
export interface ConsentRouteOptions {
	/**
	 * Where the route is mounted. Requests below it are consent requests.
	 *
	 * @default '/api/inth'
	 */
	routePrefix?: string;
	/**
	 * The `mode` given to `provideInth()`, so the route reads the manifest
	 * where the server render does: a `manifest()` mode's `snapshot` or
	 * `manifestUrl`, unless that URL is this route's own.
	 *
	 * @default manifest()
	 */
	mode?: InthOptions['mode'];
	/**
	 * The Inth backend. The manifest is read from `${projectUrl}/v1/consent/manifest`
	 * unless `manifestUrl` or `snapshot` is set; session reports and the
	 * proxy go here. Must not name this route.
	 */
	projectUrl?: string;
	/**
	 * Full manifest URL. Takes precedence over `${projectUrl}/v1/consent/manifest` and
	 * the mode's.
	 */
	manifestUrl?: string;
	/** A manifest to resolve with, in place of the mode's. No manifest is fetched. */
	snapshot?: ConsentManifest;
	/** Fetch for an absolute `projectUrl` or `manifestUrl`. */
	fetch?: ManifestFetch;
	/** Fetches the Global Vendor List when the resolved policy is IAB. */
	fetchGvl?: ConsentRouteFetchGvl;
	/**
	 * Resolve a relative `projectUrl` against the request's forwarding
	 * headers and believe the client IP chain. Only behind a proxy that sets
	 * those headers and drops incoming ones.
	 *
	 * @default false
	 */
	trustForwardedHeaders?: boolean;
	/**
	 * Forward consent writes to `projectUrl` through this route, so the
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
	 * `provideInthServer({ route })` resolves a backend on this route
	 * through it.
	 */
	readonly localFetch: ManifestFetch;
	/**
	 * {@link localFetch} for one incoming request: the in-process request
	 * carries that request's site origin, as `resolveRequestOrigin` reads
	 * it, and its forwarding headers when the route trusts them, so a
	 * `/`-relative upstream outside the route resolves on the real site.
	 * `provideInthServer({ route })` uses it with Angular's `REQUEST`.
	 *
	 * @param request - The request being rendered, or `null` for none.
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
	return pathname.startsWith(`${prefix}/`)
		? trimPathSlashes(pathname.slice(prefix.length))
		: undefined;
};

/** Headers an in-process request carries when the route trusts them. */
const FORWARDING_HEADERS = [
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	'x-forwarded-ssl',
] as const;

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
 * import { createConsentRoute } from '@inth/angular/ssr';
 *
 * export const consentRoute = createConsentRoute({
 *   projectUrl: process.env['INTH_PROJECT_URL'],
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
 * @throws {TypeError} When `routePrefix` is `/` or not a path, a relative
 * `projectUrl` or `manifestUrl` is the route or beneath it, or `mode` is
 * not a mode.
 */
export const createConsentRoute = function createConsentRoute(
	options: ConsentRouteOptions = {}
): ConsentRoute {
	const routePrefix = normalizeRoutePrefix(
		ADAPTER,
		options.routePrefix ?? DEFAULT_CONSENT_ROUTE_PREFIX
	);
	const { route } = resolveServerMode({
		adapter: ADAPTER,
		browserTransports: true,
		mode: options.mode as ServerModeInput,
		projectUrl: options.projectUrl,
		routePrefix,
	});
	const handler = createConsentRouteHandler({
		adapter: ADAPTER,
		fetch: options.fetch,
		fetchGvl: options.fetchGvl,
		manifest: options.snapshot ?? route.manifest,
		manifestUrl: options.manifestUrl ?? route.manifestUrl,
		projectUrl: route.projectUrl,
		proxy: options.proxy,
		routePrefix,
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
		return await handler(request, {
			forwarding,
			path,
			waitUntil: options.waitUntil,
		});
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
				requestUrl: request.url,
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
