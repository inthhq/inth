/**
 * Shared manifest HTTP cache. Does not load translations or resolve policy.
 * Its upstream requests are in `manifest-cache-runtime.api.ts`.
 */
import type { ConsentManifest } from '@inth/sdk-schema/types';

import { V1_ROUTES } from '../transports/v1/v1-routes';
import { boundedSet, mapFor } from './bounded-map.model';
import {
	forbidsReuse,
	parseCacheDirectiveSeconds,
} from './cache-directive.model';
import { trimSlash } from './trim-slash';

/**
 * Just the call signature the manifest cache needs.
 *
 * Deliberately narrower than `typeof globalThis.fetch`, which carries static
 * members (`fetch.preconnect` under recent `@types/node`) that no sensible
 * custom implementation provides — Nitro's `localFetch` included.
 */
export type ManifestFetch = (
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>;

/** A manifest response held by the in-process cache. */
export interface CachedManifestResponse {
	/** The parsed manifest body. */
	manifest: ConsentManifest;
	/** Upstream response headers, keys lower-cased. */
	headers: Record<string, string>;
	/** The backend's `s-maxage`, in seconds, or `0` when it sent none. */
	sMaxAge: number;
	/**
	 * Epoch milliseconds after which the entry is stale. A stale entry is
	 * still served until {@link staleUntil} while one background
	 * revalidation runs; past that it blocks on the upstream again.
	 */
	expiresAt: number;
	/**
	 * Epoch milliseconds until which a stale entry may still be served:
	 * `expiresAt` plus the backend's `stale-while-revalidate`. Equal to
	 * `expiresAt` when the backend sent no such directive.
	 */
	staleUntil: number;
	/** Epoch milliseconds when the upstream response was received. */
	fetchedAt: number;
	/** The upstream `Age` at receipt, in seconds, so TTLs do not restart. */
	upstreamAge: number;
}

/**
 * Current age of a cached manifest in seconds: the upstream `Age` plus the
 * time it has spent in this cache. Forward it as `Age` so a downstream CDN
 * counts the remaining lifetime instead of restarting the TTL.
 *
 * @param now - Current time in epoch milliseconds. Defaults to `Date.now()`.
 * @returns The age in whole seconds.
 */
export const getManifestAge = function getManifestAge(
	entry: Pick<CachedManifestResponse, 'fetchedAt' | 'upstreamAge'>,
	now: number = Date.now()
): number {
	return (
		entry.upstreamAge + Math.max(0, Math.floor((now - entry.fetchedAt) / 1000))
	);
};

/**
 * Storage behind {@link fetchCachedManifest}, keyed by the cache key that
 * {@link fetchCachedManifest} documents. A `Map<string,
 * CachedManifestResponse>` satisfies it; hosts that want per-request or
 * per-tenant isolation can supply their own.
 */
export interface ManifestCache {
	get: (cacheKey: string) => CachedManifestResponse | undefined;
	set: (cacheKey: string, entry: CachedManifestResponse) => unknown;
	delete: (cacheKey: string) => unknown;
	clear: () => void;
}

/** Options for {@link createManifestCache}. */
export interface ManifestCacheOptions {
	/**
	 * Most entries the cache holds at once. Keys include the query string
	 * and any credential partition, so a visitor can mint new keys with
	 * public input such as `?language=`; the cap keeps that bounded.
	 *
	 * @default 128
	 */
	maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 128;

/**
 * Creates an empty, bounded manifest cache. Reads refresh an entry's
 * recency; when a write would exceed `maxEntries`, entries past their
 * stale window go first, then the least recently used. A stale entry that
 * can still be served therefore competes on recency like a fresh one, so
 * a manifest read on every request stays put while keys minted once (a
 * `?language=` a visitor made up) age out.
 *
 * @returns A cache instance for {@link fetchCachedManifest}.
 */
export const createManifestCache = function createManifestCache(
	options: ManifestCacheOptions = {}
): ManifestCache {
	const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
	const entries = new Map<string, CachedManifestResponse>();

	const makeRoom = function makeRoom(): void {
		if (entries.size < maxEntries) {
			return;
		}
		const now = Date.now();
		for (const [key, entry] of entries) {
			if (entry.staleUntil <= now) {
				entries.delete(key);
			}
		}
		while (entries.size >= maxEntries) {
			const oldest = entries.keys().next();
			if (oldest.done) {
				break;
			}
			entries.delete(oldest.value);
		}
	};

	return {
		clear: () => entries.clear(),
		delete: (key) => entries.delete(key),
		get: (key) => {
			const entry = entries.get(key);
			if (entry) {
				// Re-insert so Map iteration order doubles as recency.
				entries.delete(key);
				entries.set(key, entry);
			}
			return entry;
		},
		set: (key, entry) => {
			if (entries.has(key)) {
				entries.delete(key);
			} else {
				makeRoom();
			}
			entries.set(key, entry);
		},
	};
};

/**
 * The process cache: the one cache every server adapter (Next.js, Nuxt,
 * SvelteKit, Astro, TanStack Start) reads when it passes no `cache`. It
 * holds the default 128 entries, enough for every bundled translation
 * language on a few credential partitions.
 */
export const defaultManifestCache = createManifestCache();

/** An upstream request shared by every caller waiting on the same key. */
export interface InflightFill {
	promise: Promise<CachedManifestResponse>;
	/** Wall-clock epoch milliseconds when the upstream request started. */
	startedAt: number;
}

/** In-flight upstream requests, so concurrent misses share one fetch. */
export const inflightByCache = new WeakMap<
	ManifestCache,
	Map<string, InflightFill>
>();

/**
 * Most revalidation floors held per cache. A floor exists only while a key
 * is being served stale after a failed or already-stale refresh, so a
 * handful is the norm; the cap is a hard bound against visitor-minted keys,
 * not a working-set size. It is twice the default cache cap so every live
 * key in a default cache keeps its floor through an outage, with room for
 * churn; a larger caller-supplied cache can lose a floor early, which costs
 * one extra revalidation attempt for that key. Insertion order doubles as
 * age, so the oldest record goes first when the cap is reached.
 */
const MAX_REVALIDATION_FLOORS = DEFAULT_MAX_ENTRIES * 2;

/**
 * Earliest time a stale entry may be revalidated again, per cache key, so a
 * source that keeps answering stale (a CDN whose origin is down) or keeps
 * failing is asked at most once per {@link MANIFEST_DEDUPE_TTL_SECONDS}
 * while the entry is served. Keyed by cache key rather than entry identity
 * because a caller-supplied {@link ManifestCache} may return a fresh object
 * on every read. A record is dropped whenever a fresh entry is stored for
 * its key, when the key is deleted or read after eviction, and when the
 * map reaches {@link MAX_REVALIDATION_FLOORS}; lapsed records are inert
 * either way. Evicting a live record early only costs one extra
 * revalidation attempt for that key.
 */
export const revalidateAfterByCache = new WeakMap<
	ManifestCache,
	Map<string, number>
>();

/**
 * Snapshot of the revalidation floors a cache currently holds, keyed by
 * cache key. Lapsed records are inert, so no public behaviour exposes the
 * map's size or contents; tests read this instead.
 *
 * @internal
 */
export const readRevalidationFloors = function readRevalidationFloors(
	cache: ManifestCache
): ReadonlyMap<string, number> {
	const floors = revalidateAfterByCache.get(cache);
	return floors ? new Map(floors) : new Map();
};

export const setRevalidationFloor = function setRevalidationFloor(
	cache: ManifestCache,
	cacheKey: string,
	deadline: number
): void {
	boundedSet(
		mapFor(revalidateAfterByCache, cache),
		cacheKey,
		deadline,
		MAX_REVALIDATION_FLOORS
	);
};

/**
 * Shortest wait, in milliseconds, before a key whose last upstream fill
 * failed with nothing servable in the cache is asked again. Each further
 * consecutive failure doubles it, up to {@link MANIFEST_FAILURE_RETRY_MAX_MS}.
 */
export const MANIFEST_FAILURE_RETRY_MIN_MS = 1000;

/**
 * Longest wait, in milliseconds, between upstream attempts for a key that
 * keeps failing with nothing servable in the cache. Matches the floor for a
 * stale entry whose refresh failed ({@link MANIFEST_DEDUPE_TTL_SECONDS}), so
 * a recovered backend is noticed within five seconds either way.
 */
export const MANIFEST_FAILURE_RETRY_MAX_MS = 5000;

/**
 * How long one upstream manifest request may take before the cache aborts it
 * and records a failure. Callers that must answer sooner pass `timeoutMs`;
 * the upstream request keeps running for them in the background.
 */
export const MANIFEST_FETCH_TIMEOUT_MS = 5000;

/**
 * Why {@link fetchCachedManifest} gave up without a manifest.
 *
 * - `timeout`: the caller's `timeoutMs` ran out before the upstream answered.
 *   The upstream request keeps running and fills the cache for later callers.
 * - `backoff`: the last upstream attempt for this key failed and the retry
 *   floor has not passed, so no request was made. `cause` holds that failure.
 */
export type ManifestUnavailableReason = 'backoff' | 'timeout';

/**
 * Thrown by {@link fetchCachedManifest} when it answers without a manifest
 * and without asking the upstream: the caller's time budget ran out, or the
 * key is inside its retry floor after a failure. Callers should render
 * without a resolved policy (optional categories denied, consent UI hidden)
 * and let the browser resolve it.
 */
export class ManifestUnavailableError extends Error {
	/** Why no manifest was returned. */
	readonly reason: ManifestUnavailableReason;
	/**
	 * Milliseconds until the cache will ask the upstream again, for
	 * `backoff`. Suitable for a `Retry-After` header once rounded up.
	 */
	readonly retryAfterMs: number | undefined;

	constructor(
		reason: ManifestUnavailableReason,
		message: string,
		options: { cause?: unknown; retryAfterMs?: number } = {}
	) {
		super(message, { cause: options.cause });
		this.name = 'ManifestUnavailableError';
		this.reason = reason;
		this.retryAfterMs = options.retryAfterMs;
	}
}

/** The last failed fill for a key with nothing servable in the cache. */
interface FillFailure {
	/** The failure, rethrown as `cause` while the floor holds. */
	error: unknown;
	/** Consecutive failures, which set the backoff. */
	failures: number;
	/** Epoch milliseconds before which the upstream is not asked again. */
	retryAt: number;
}

/**
 * Failed fills per cache key, so a backend that is down is asked once per
 * retry floor instead of once per request. Bounded like the revalidation
 * floors: the oldest record goes first, which only costs that key one early
 * retry. A success for the key, a delete, and a clear drop the record.
 */
export const failuresByCache = new WeakMap<
	ManifestCache,
	Map<string, FillFailure>
>();

export const recordFillFailure = function recordFillFailure(
	cache: ManifestCache,
	cacheKey: string,
	error: unknown,
	settledAt: number
): void {
	const failures = mapFor(failuresByCache, cache);
	const previous = failures.get(cacheKey);
	const count = (previous?.failures ?? 0) + 1;
	const floor = Math.min(
		MANIFEST_FAILURE_RETRY_MIN_MS * 2 ** (count - 1),
		MANIFEST_FAILURE_RETRY_MAX_MS
	);
	boundedSet(
		failures,
		cacheKey,
		{ error, failures: count, retryAt: settledAt + floor },
		MAX_REVALIDATION_FLOORS
	);
};

/**
 * Snapshot of the failure records a cache holds, keyed by cache key: the
 * consecutive failure count and when the upstream may be asked again.
 *
 * @internal
 */
export const readFillFailures = function readFillFailures(
	cache: ManifestCache
): ReadonlyMap<string, { failures: number; retryAt: number }> {
	const failures = failuresByCache.get(cache);
	return new Map(
		[...(failures ?? [])].map(([key, record]) => [
			key,
			{ failures: record.failures, retryAt: record.retryAt },
		])
	);
};

/**
 * Generation counters so a fill that started before `clearManifestCache`
 * cannot write the discarded value back once it completes.
 */
const generationByCache = new WeakMap<ManifestCache, number>();

export const getGeneration = function getGeneration(
	cache: ManifestCache
): number {
	return generationByCache.get(cache) ?? 0;
};

/**
 * Empties a manifest cache, including fills still in flight: pending
 * callers keep their promise, but its result is not stored and later
 * callers start a fresh fetch.
 *
 * @param cache - The cache to clear. Defaults to the process cache.
 */
export const clearManifestCache = function clearManifestCache(
	cache: ManifestCache = defaultManifestCache
): void {
	cache.clear();
	inflightByCache.get(cache)?.clear();
	revalidateAfterByCache.get(cache)?.clear();
	failuresByCache.get(cache)?.clear();
	generationByCache.set(cache, getGeneration(cache) + 1);
};

/**
 * Response headers a proxying manifest route forwards downstream verbatim.
 *
 * `vary` is deliberately NOT forwarded. The route sends no request headers
 * upstream and returns no CORS headers downstream, so its body is a pure
 * function of the request URL. The backend's `Vary: Origin` would only
 * fragment the edge cache for no benefit.
 */
export const MANIFEST_PASSTHROUGH_HEADERS = [
	'cache-control',
	'etag',
	'last-modified',
	'content-language',
] as const;

/**
 * In-process dedupe floor, in seconds, for backends that serve `/v1/consent/manifest`
 * without a shared-cache TTL. Without it every request to an older backend
 * would hit the network. Kept deliberately short: it only collapses
 * concurrent/bursty requests and is never advertised downstream as a
 * `Cache-Control` value.
 */
export const MANIFEST_DEDUPE_TTL_SECONDS = 5;

export const normalizeHeaders = function normalizeHeaders(
	headers: Headers
): Record<string, string> {
	const normalized: Record<string, string> = {};
	headers.forEach((value, key) => {
		normalized[key.toLowerCase()] = value;
	});
	return normalized;
};

/**
 * Reads the `s-maxage` directive from a `Cache-Control` header.
 *
 * @returns The directive in seconds, or `0` when absent or invalid.
 */
export const getManifestSMaxAge = function getManifestSMaxAge(
	cacheControl: string | null | undefined
): number {
	return parseCacheDirectiveSeconds(cacheControl, 's-maxage') ?? 0;
};

/**
 * Reads the `stale-while-revalidate` directive from a `Cache-Control` header.
 *
 * @returns The directive in seconds, or `0` when absent or invalid.
 */
export const getManifestStaleWhileRevalidate =
	function getManifestStaleWhileRevalidate(
		cacheControl: string | undefined
	): number {
		return (
			parseCacheDirectiveSeconds(cacheControl, 'stale-while-revalidate') ?? 0
		);
	};

/** `true` when the backend sent an `s-maxage` directive, including `0`. */
const hasSharedMaxAge = function hasSharedMaxAge(
	cacheControl: string | undefined
): boolean {
	return parseCacheDirectiveSeconds(cacheControl, 's-maxage') !== undefined;
};

/**
 * How long to keep an entry in the in-process cache. `no-store`, `no-cache`,
 * and `private` win over everything else, including a positive `s-maxage`,
 * so a response the backend marked non-reusable never enters the shared
 * cache. Otherwise an explicit `s-maxage` is used as-is (`0` means
 * revalidate on every use) and a missing directive falls back to the floor.
 */
export const resolveManifestCacheTtlSeconds =
	function resolveManifestCacheTtlSeconds(
		cacheControl: string | undefined,
		sMaxAge: number
	): number {
		if (forbidsReuse(cacheControl)) {
			return 0;
		}
		if (hasSharedMaxAge(cacheControl)) {
			return sMaxAge;
		}
		return MANIFEST_DEDUPE_TTL_SECONDS;
	};

/**
 * Fresh and stale deadlines for a response received at `now`. The upstream
 * `Age` is charged against both windows so a copy a CDN has already held
 * for a while, or is already serving stale, does not get a restarted TTL.
 */
export const resolveEntryLifetime = function resolveEntryLifetime(input: {
	cacheControl: string | undefined;
	now: number;
	sMaxAge: number;
	upstreamAge: number;
}): { expiresAt: number; staleUntil: number; ttl: number } {
	const ttl = resolveManifestCacheTtlSeconds(input.cacheControl, input.sMaxAge);
	// The stale window only applies to a response that opted into shared
	// caching with an explicit `s-maxage` (`0` included: stale on arrival, not
	// unreusable). Without it the TTL is the dedupe floor, which is not a
	// freshness lifetime to extend; and `no-store`, `no-cache`, and `private`
	// switch the window off outright.
	const staleWhileRevalidate =
		!forbidsReuse(input.cacheControl) && hasSharedMaxAge(input.cacheControl)
			? getManifestStaleWhileRevalidate(input.cacheControl)
			: 0;
	const expiresAt = input.now + Math.max(0, ttl - input.upstreamAge) * 1000;
	const staleUntil =
		input.now +
		Math.max(0, ttl + staleWhileRevalidate - input.upstreamAge) * 1000;
	return { expiresAt, staleUntil, ttl };
};

/** Where a server adapter reads the manifest from. */
export interface ManifestSourceOptions {
	/** Backend URL; the manifest is read from `${projectUrl}/v1/consent/manifest`. */
	projectUrl?: string;
	/** Explicit manifest URL. Takes precedence over `projectUrl`. */
	manifestUrl?: string;
}

/**
 * Resolves the upstream manifest URL from adapter configuration.
 *
 * @throws {Error} When neither `manifestUrl` nor `projectUrl` is set.
 */
export const resolveManifestSourceUrl = function resolveManifestSourceUrl(
	options: ManifestSourceOptions
): string {
	if (options.manifestUrl) {
		return options.manifestUrl;
	}
	if (!options.projectUrl) {
		throw new Error(
			'inth manifest cache: `projectUrl` or `manifestUrl` is required.'
		);
	}
	return `${trimSlash(options.projectUrl)}${V1_ROUTES.manifest}`;
};

/**
 * Builds the URL part of the cache key: the source URL with `query`
 * appended, parameters sorted by
 * name (repeated names keep their relative order), re-encoded the way
 * `URLSearchParams` serialises them, and any empty `?` or `#fragment`
 * dropped. `?b=2&a=1`, `?a=1&b=2` and `?a=1&b=2#x` therefore read and fill
 * one entry. The part before `?` is kept as written, so a read without any
 * query costs two string scans on the hot path. Parameter values are not
 * validated here; a route that forwards a visitor's raw query still mints
 * one key per distinct value, which the cache's `maxEntries` bound caps.
 *
 * @param input - The source URL and an already-encoded query string such as
 * `language=de`, with or without a leading `?`.
 * @returns The normalised request URL.
 */
export const createManifestRequestUrl =
	function createManifestRequestUrl(input: {
		sourceUrl: string;
		query?: string;
	}): string {
		const { sourceUrl } = input;
		const hashIndex = sourceUrl.indexOf('#');
		const withoutFragment =
			hashIndex === -1 ? sourceUrl : sourceUrl.slice(0, hashIndex);
		const queryIndex = withoutFragment.indexOf('?');
		const base =
			queryIndex === -1
				? withoutFragment
				: withoutFragment.slice(0, queryIndex);
		const sourceQuery =
			queryIndex === -1 ? '' : withoutFragment.slice(queryIndex + 1);
		const extraQuery = input.query?.startsWith('?')
			? input.query.slice(1)
			: (input.query ?? '');
		if (!sourceQuery && !extraQuery) {
			return base;
		}
		const params = new URLSearchParams(sourceQuery);
		for (const [name, value] of new URLSearchParams(extraQuery)) {
			params.append(name, value);
		}
		params.sort();
		const search = params.toString();
		return search ? `${base}?${search}` : base;
	};

/**
 * The URL the upstream request goes to: the source URL as configured, with
 * `query` appended unchanged and any `#fragment` dropped. Only the cache key
 * is normalised, so a URL signed over its exact query still verifies.
 */
export const createManifestFetchUrl = function createManifestFetchUrl(input: {
	sourceUrl: string;
	query?: string;
}): string {
	const { sourceUrl } = input;
	const hashIndex = sourceUrl.indexOf('#');
	const base = hashIndex === -1 ? sourceUrl : sourceUrl.slice(0, hashIndex);
	const query = input.query?.startsWith('?')
		? input.query.slice(1)
		: input.query;
	if (!query) {
		return base;
	}
	return `${base}${base.includes('?') ? '&' : '?'}${query}`;
};

/** Options for {@link fetchCachedManifest}. */
export interface FetchCachedManifestOptions {
	/** Resolved upstream manifest URL (see {@link resolveManifestSourceUrl}). */
	sourceUrl: string;
	/** Fetch implementation. Defaults to `globalThis.fetch`. */
	fetch?: ManifestFetch;
	/**
	 * Already-encoded query string appended to `sourceUrl`, such as
	 * `language=de`. Sent upstream as written; the cache key holds it in the
	 * sorted form {@link createManifestRequestUrl} builds.
	 */
	query?: string;
	/** Current time in epoch milliseconds. Defaults to `Date.now()`. */
	now?: number;
	/**
	 * Cache to read and write. Defaults to the process cache shared by every
	 * caller in this process. Pass one from {@link createManifestCache} only
	 * to isolate a route or a test.
	 */
	cache?: ManifestCache;
	/**
	 * Extra headers for the upstream request, for example an authentication
	 * header a private manifest requires. Entries are partitioned by a digest
	 * of these headers, so callers with different credentials never share a
	 * cached manifest or an in-flight request, and the key holds no secret.
	 * Credentials (`cookie`, `authorization`) are refused over plain `http:`
	 * unless the host is a loopback address. Requests with identity headers
	 * reject redirects so credentials cannot reach an unvalidated target.
	 * Headers the cache already sends with the same value (`accept:
	 * application/json` and the Inth protocol headers) are not part of the key.
	 */
	headers?: Record<string, string>;
	/**
	 * Per-framework fetch hint, spread into the upstream `fetch` call, such as
	 * Next.js `{ next: { revalidate: 60 } }` for the App Router Data Cache.
	 * Not part of the cache key: whichever caller starts the upstream request
	 * for a key decides the hint for that request, and a background
	 * revalidation reuses the hint of the read that triggered it. Without a
	 * signal, the upstream request is aborted after
	 * {@link MANIFEST_FETCH_TIMEOUT_MS}.
	 */
	init?: Omit<RequestInit, 'headers' | 'method'>;
	/**
	 * Longest this call waits for the upstream, in milliseconds, when nothing
	 * servable is cached. Counted from the start of the upstream request, so a
	 * call that joins a request already in flight only gets what is left of
	 * it. When it runs out the call rejects with a
	 * {@link ManifestUnavailableError} (`reason: 'timeout'`), and the upstream
	 * request keeps running to fill the cache for later callers; its promise
	 * goes to `onBackgroundRevalidate`. Fresh and stale-while-revalidate reads
	 * answer from memory and never wait. Omit to wait for the upstream request
	 * itself.
	 */
	timeoutMs?: number;
	/**
	 * Called with the promise of upstream work that outlives this call: a
	 * background revalidation of a stale entry, or a fill this call stopped
	 * waiting for when `timeoutMs` ran out. A host passes it to the platform
	 * so the work survives the response on runtimes that cancel detached async
	 * work once a response is sent (Vercel `waitUntil`, Next.js `after`,
	 * Cloudflare `ctx.waitUntil`). The promise never rejects. Not called when
	 * the read is served fresh or waits for the upstream to finish.
	 */
	onBackgroundRevalidate?: (revalidation: Promise<void>) => void;
}

/**
 * Settles with `task`, or rejects with `onTimeout()` after `ms`, whichever is
 * first. The timer is cleared as soon as either happens.
 */
export const raceTimer = async function raceTimer<Value>(
	task: Promise<Value>,
	ms: number,
	onTimeout: () => Error
): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			reject(onTimeout());
		}, ms);
	});
	try {
		return await Promise.race([task, expired]);
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Bounds a whole server-side consent resolution, not only its manifest read:
 * rejects with a {@link ManifestUnavailableError} (`reason: 'timeout'`) once
 * `timeoutMs` has passed. The task itself is not cancelled.
 *
 * @param timeoutMs - Budget in milliseconds. `undefined` or a non-finite
 * value returns the task unchanged.
 * @returns The task's result, if it settles in time.
 * @throws {ManifestUnavailableError} When the budget runs out first.
 */
export const withResolutionBudget = function withResolutionBudget<Value>(
	task: Promise<Value>,
	timeoutMs: number | undefined
): Promise<Value> {
	if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
		return task;
	}
	const budgetMs = Math.max(0, timeoutMs);
	return raceTimer(
		task,
		budgetMs,
		() =>
			new ManifestUnavailableError(
				'timeout',
				`inth: consent resolution did not finish within ${budgetMs} ms.`
			)
	);
};

/**
 * Default time budget, in milliseconds, for resolving consent while a server
 * renders a page. Server adapters wait at most this long for the manifest (or
 * backend `/v1/consent/init`) before rendering without a resolved policy.
 *
 * A warm in-process cache answers in about a millisecond. A cold read over a
 * new TLS connection to a hosted backend measured 115 to 385 ms, so 500 ms
 * covers a healthy cold start while keeping an outage from holding the page.
 */
export const DEFAULT_RESOLVE_TIMEOUT_MS = 500;
