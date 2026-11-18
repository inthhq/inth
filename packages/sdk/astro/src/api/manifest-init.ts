/**
 * Where the injected routes read the manifest from. The server render
 * resolves through `resolveRequestConsent` in `@inth/sdk/server` instead.
 */
import { resolveRequestProjectUrl } from '@inth/sdk/server';
import type { ConsentRouteFetchGvl } from '@inth/sdk/server';

import type { InthResolvedOptions } from '../types';

const MANIFEST_ROUTE_SUFFIX = '/manifest';

/** Fetches the Global Vendor List when the resolved policy is IAB. */
export type FetchGvl = ConsentRouteFetchGvl;

/**
 * The parts of a request URL resolution needs.
 *
 * The middleware has `Astro.locals`-adjacent `Headers` and a URL string; the
 * route handlers have a whole `Request`. Both narrow to this.
 */
export interface RequestSource {
	/** The absolute request URL, when the caller has one. */
	url?: string;
	/** The incoming request headers. */
	headers: Headers;
}

const trimSlash = function trimSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
};

/**
 * Work out where `GET /manifest` lives for this request.
 *
 * `manifestUrl` when set, otherwise `${projectUrl}/manifest`.
 *
 * @param source - The request URL and headers, used to resolve relative URLs.
 * @param options - The resolved integration options.
 * @returns An absolute manifest URL.
 * @throws {Error} When neither a manifest URL nor a backend URL is configured.
 */
export const resolveManifestSourceFrom = function resolveManifestSourceFrom(
	source: RequestSource,
	options: InthResolvedOptions
): string {
	const { mode } = options;
	const manifestUrl = mode.type === 'manifest' ? mode.manifestUrl : undefined;
	if (manifestUrl) {
		const resolved = resolveRequestProjectUrl(manifestUrl, {
			headers: source.headers,
			requestUrl: source.url,
		});
		if (!resolved) {
			throw new Error('@inth/astro: invalid manifest URL.');
		}
		return resolved;
	}

	const { projectUrl } = options;
	if (!projectUrl) {
		throw new Error('@inth/astro: pass projectUrl or manifestUrl.');
	}
	const resolved = resolveRequestProjectUrl(projectUrl, {
		headers: source.headers,
		requestUrl: source.url,
	});
	if (!resolved) {
		throw new Error('@inth/astro: invalid backend URL.');
	}
	return `${trimSlash(resolved)}${MANIFEST_ROUTE_SUFFIX}`;
};
