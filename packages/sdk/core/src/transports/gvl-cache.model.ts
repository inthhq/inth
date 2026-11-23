/**
 * Shared in-process GVL cache. Honors upstream lifetime and reuse directives,
 * coalesces concurrent requests, and invalidates pending fills when cleared.
 */
import type { GlobalVendorList } from '@inth/sdk-schema/types';

import {
	forbidsReuse,
	parseCacheDirectiveSeconds,
	readUpstreamAge,
} from '../libs/cache-directive.model';
import { failedResponseError } from '../libs/failed-response-error';
import { clearStaleCache, readThrough } from './stale-on-error.model';
import type { StaleCache, StaleEntry } from './stale-on-error.model';

export type CachedGvl = StaleEntry<GlobalVendorList | null>;

export type GvlCache = StaleCache<GlobalVendorList | null>;

export interface FetchCachedGvlOptions {
	/** Vendor list endpoint from the manifest's `iab.gvl.url`. */
	url: string;
	/** Primary language subtag the list should be localised to. */
	language: string;
	fetch: typeof globalThis.fetch;
	/** Extra request headers (version headers, for example). */
	headers?: Record<string, string>;
	/** Error prefix naming the caller. */
	label?: string;
	/** Injected for tests. */
	now?: number;
	cache?: GvlCache;
}

const DEFAULT_TTL_SECONDS = 86_400;
/**
 * How long a failed fetch is remembered before the next call tries again.
 * A stalled request holds an init for the full fetch timeout, so without
 * this an outage would slow every init, not one a minute.
 */
const FAILURE_BACKOFF_MS = 60_000;
/** Most lists one cache keeps, one per URL and language; the oldest goes first. */
const MAX_ENTRIES = 64;

const defaultGvlCache: GvlCache = new Map();

const ttlFromHeaders = function ttlFromHeaders(headers: Headers): number {
	const cacheControl = headers.get('cache-control');
	if (forbidsReuse(cacheControl)) {
		return 0;
	}
	const ttl =
		parseCacheDirectiveSeconds(cacheControl, 's-maxage') ??
		parseCacheDirectiveSeconds(cacheControl, 'max-age') ??
		DEFAULT_TTL_SECONDS;
	return Math.max(0, ttl - readUpstreamAge(headers.get('age')));
};

/** Drops every cached list; the next call fetches again. */
export const clearGvlCache = function clearGvlCache(
	cache: GvlCache = defaultGvlCache
): void {
	clearStaleCache(cache);
};

/**
 * Fetches a vendor list through the cache. When a refresh fails, by status
 * or by a thrown or aborted fetch, the last good list is served, and the
 * endpoint is not asked again for a minute.
 *
 * @param options - Endpoint, language, and fetch implementation.
 * @returns The list, or `null` when the endpoint answered 204.
 * @throws {Error} When the endpoint fails and no stale entry exists.
 */
export const fetchCachedGvl = function fetchCachedGvl(
	options: FetchCachedGvlOptions
): Promise<GlobalVendorList | null> {
	const label = options.label ?? 'inth';
	return readThrough({
		backoffMs: FAILURE_BACKOFF_MS,
		cache: options.cache ?? defaultGvlCache,
		fallback: (error) => {
			throw error;
		},
		key: `${options.url}|${options.language}`,
		async load() {
			const response = await options.fetch(options.url, {
				headers: { 'accept-language': options.language, ...options.headers },
				method: 'GET',
			});
			if (!response.ok && response.status !== 204) {
				throw await failedResponseError(`${label}: GVL`, response);
			}
			const value =
				response.status === 204
					? null
					: ((await response.json()) as GlobalVendorList);
			return {
				freshMs: ttlFromHeaders(response.headers) * 1000,
				// The last good list stays the fallback until a new one replaces it.
				staleMs: Number.POSITIVE_INFINITY,
				value,
			};
		},
		maxEntries: MAX_ENTRIES,
		now: options.now ?? Date.now(),
	});
};
