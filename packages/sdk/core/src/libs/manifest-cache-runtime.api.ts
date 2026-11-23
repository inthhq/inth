/**
 * The manifest cache's upstream requests: `fetchCachedManifest`, the one
 * manifest-cache entry point every server adapter calls, and the fill and
 * revalidation it sends.
 *
 * @packageDocumentation
 */
import type { ConsentManifest } from '@inth/sdk-schema/types';

import { readApiError } from '../transports/v1/inth-api-error';
import { mapFor } from './bounded-map.model';
import { readUpstreamAge } from './cache-directive.model';
import {
	identityHeaderOf,
	isCleartextRemoteURL,
	PUBLIC_REQUEST_HEADERS,
} from './identity-headers.model';
import {
	createManifestFetchUrl,
	createManifestRequestUrl,
	defaultManifestCache,
	failuresByCache,
	getGeneration,
	getManifestSMaxAge,
	inflightByCache,
	MANIFEST_DEDUPE_TTL_SECONDS,
	MANIFEST_FETCH_TIMEOUT_MS,
	ManifestUnavailableError,
	normalizeHeaders,
	raceTimer,
	recordFillFailure,
	resolveEntryLifetime,
	revalidateAfterByCache,
	setRevalidationFloor,
} from './manifest-cache-runtime';
import type {
	CachedManifestResponse,
	FetchCachedManifestOptions,
	InflightFill,
	ManifestCache,
	ManifestFetch,
} from './manifest-cache-runtime';

/**
 * Request headers that carry no visitor identity: the public browser
 * headers. Anything else a host
 * forwards (an API key, a tenant selector) is treated as a credential for
 * transport purposes.
 */
const PUBLIC_MANIFEST_HEADERS: ReadonlySet<string> = new Set(
	PUBLIC_REQUEST_HEADERS
);

const findIdentityHeader = (
	headers: Record<string, string> | undefined
): string | undefined =>
	identityHeaderOf(Object.keys(headers ?? {}), PUBLIC_MANIFEST_HEADERS);

/** Refuses to send credentials in clear text to anything but loopback. */
const assertCredentialTransport = function assertCredentialTransport(
	requestUrl: string,
	headers: Record<string, string> | undefined
): void {
	const identityHeader = findIdentityHeader(headers);
	if (identityHeader && isCleartextRemoteURL(requestUrl)) {
		throw new Error(
			`inth manifest cache: refusing to send credentials over http to ${new URL(requestUrl).host} (${identityHeader}). Use https, or a loopback host for local development.`
		);
	}
};

const HASH_LANES = [31, 131, 16_777_619] as const;
const LANE_MODULUS = 4_294_967_296;

/** One 32-bit lane of a multiplicative string hash, no bitwise ops. */
const hashLane = function hashLane(value: string, multiplier: number): string {
	let hash = 2_166_136_261 % LANE_MODULUS;
	for (let index = 0; index < value.length; index += 1) {
		hash =
			(((hash * multiplier) % LANE_MODULUS) + value.charCodeAt(index)) %
			LANE_MODULUS;
	}
	return hash.toString(16).padStart(8, '0');
};

const digest = async function digest(value: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle) {
		const bytes = await subtle.digest(
			'SHA-256',
			new TextEncoder().encode(value)
		);
		return Array.from(new Uint8Array(bytes), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
	}
	// Without WebCrypto (only very old runtimes): three independent 32-bit
	// lanes (96 bits) of a multiplicative string hash. Not cryptographic, but
	// free of the credential value, which is what a caller-supplied cache that
	// logs or persists keys must never see.
	return HASH_LANES.map((multiplier) => hashLane(value, multiplier)).join('');
};

/**
 * Request headers every upstream manifest request carries. A function, not
 * a module-level object: browser bundles reach this module through
 * `transports/gvl-cache.model`, and an object spread at module level is kept by
 * bundlers even when nothing reads it.
 */
const defaultRequestHeaders = function defaultRequestHeaders(): Record<
	string,
	string
> {
	return { accept: 'application/json' };
};

/**
 * Cache key: the normalised request URL alone, or the URL plus a SHA-256
 * digest of the caller's headers (names lower-cased, sorted, defaults with
 * an unchanged value left out) so different credentials never share an
 * entry and the key holds no secret.
 */
const buildCacheKey = async function buildCacheKey(
	requestUrl: string,
	headers: Record<string, string> | undefined
): Promise<string> {
	const defaults = defaultRequestHeaders();
	const scope = Object.entries(headers ?? {})
		.map(([name, value]) => [name.toLowerCase(), value] as const)
		.filter(([name, value]) => defaults[name] !== value)
		.map(([name, value]) => `${name}=${value}`)
		.sort();
	if (scope.length === 0) {
		return requestUrl;
	}
	return `${requestUrl}#${await digest(scope.join('\n'))}`;
};

const revalidateManifest = async function revalidateManifest(input: {
	cache: ManifestCache;
	cacheKey: string;
	cached: CachedManifestResponse | undefined;
	fetchImpl: ManifestFetch;
	generation: number;
	init: FetchCachedManifestOptions['init'];
	headers: Record<string, string> | undefined;
	now: number;
	requestUrl: string;
}): Promise<CachedManifestResponse> {
	const { cache, cacheKey, cached, fetchImpl, generation, now, requestUrl } =
		input;
	// A clear during the fetch bumps the generation; then the result is
	// returned to the waiting callers but never stored.
	const store = function store(entry: CachedManifestResponse): void {
		if (getGeneration(cache) === generation) {
			cache.set(cacheKey, entry);
			if (entry.expiresAt > now) {
				// A fresh entry sets its own schedule: the next revalidation is
				// due when it expires, however this fill was started.
				revalidateAfterByCache.get(cache)?.delete(cacheKey);
			}
		}
	};
	const headers: Record<string, string> = {
		...defaultRequestHeaders(),
		...input.headers,
	};
	if (cached?.headers.etag) {
		headers['if-none-match'] = cached.headers.etag;
	}

	const response = await fetchImpl(requestUrl, {
		...input.init,
		headers,
		method: 'GET',
		redirect: findIdentityHeader(input.headers)
			? 'error'
			: input.init?.redirect,
	});

	if (response.status === 304 && cached) {
		// A 304 sets a new freshness baseline: only an Age the validation
		// response itself carries counts, never the one the stale entry had.
		const { age: _staleAge, ...retainedHeaders } = cached.headers;
		const responseHeaders = {
			...retainedHeaders,
			...normalizeHeaders(response.headers),
		};
		const sMaxAge = getManifestSMaxAge(responseHeaders['cache-control']);
		const upstreamAge = readUpstreamAge(responseHeaders.age);
		const { expiresAt, staleUntil } = resolveEntryLifetime({
			cacheControl: responseHeaders['cache-control'],
			now,
			sMaxAge,
			upstreamAge,
		});
		const refreshed: CachedManifestResponse = {
			...cached,
			expiresAt,
			fetchedAt: now,
			headers: responseHeaders,
			sMaxAge,
			staleUntil,
			upstreamAge,
		};
		if (staleUntil > now) {
			store(refreshed);
		} else if (getGeneration(cache) === generation) {
			cache.delete(cacheKey);
			revalidateAfterByCache.get(cache)?.delete(cacheKey);
		}
		return refreshed;
	}

	if (!response.ok) {
		// `status` lets a host tell a backend without `/v1/consent/manifest` (404) from
		// one that is failing, including through a `backoff` error's `cause`.
		throw await readApiError(
			'inth manifest cache: backend /v1/consent/manifest',
			response
		);
	}

	const manifest = (await response.json()) as ConsentManifest;
	const responseHeaders = normalizeHeaders(response.headers);
	const sMaxAge = getManifestSMaxAge(responseHeaders['cache-control']);
	// A source behind its own CDN reports how long the object has already
	// lived; the remaining lifetime is what this cache may grant. A copy the
	// CDN is itself serving stale arrives with `Age` past `s-maxage` and is
	// stored as already stale, so it is served while the next revalidation
	// runs instead of costing every request an upstream round trip.
	const upstreamAge = readUpstreamAge(responseHeaders.age);
	const { expiresAt, staleUntil } = resolveEntryLifetime({
		cacheControl: responseHeaders['cache-control'],
		now,
		sMaxAge,
		upstreamAge,
	});
	const entry: CachedManifestResponse = {
		expiresAt,
		fetchedAt: now,
		headers: responseHeaders,
		manifest,
		sMaxAge,
		staleUntil,
		upstreamAge,
	};
	if (staleUntil > now) {
		store(entry);
	} else if (getGeneration(cache) === generation) {
		// The replacement cannot be cached (`no-store`, `private`, or already
		// aged out), so the stale entry must not outlive it either.
		cache.delete(cacheKey);
		revalidateAfterByCache.get(cache)?.delete(cacheKey);
	}
	return entry;
};

/** Swallows a promise's outcome, for work handed to the platform. */
const settle = async function settle(task: Promise<unknown>): Promise<void> {
	try {
		await task;
	} catch {
		// The outcome is recorded elsewhere; the platform only keeps it alive.
	}
};

/**
 * Throws a `backoff` {@link ManifestUnavailableError} while the key's last
 * failure record is inside its retry floor.
 */
const assertNotBackingOff = function assertNotBackingOff(
	cache: ManifestCache,
	cacheKey: string,
	now: number
): void {
	const failure = failuresByCache.get(cache)?.get(cacheKey);
	if (!failure || failure.retryAt <= now) {
		return;
	}
	const retryAfterMs = failure.retryAt - now;
	const what =
		failure.failures === 1 ? 'request' : `${failure.failures} requests`;
	throw new ManifestUnavailableError(
		'backoff',
		`inth manifest cache: the last ${what} for this manifest failed; retrying in ${retryAfterMs} ms.`,
		{ cause: failure.error, retryAfterMs }
	);
};

/**
 * Waits for a fill within the caller's `timeoutMs`, measured from when the
 * fill started. Past it, rejects and hands the still-running fill to
 * `onBackgroundRevalidate` so the platform keeps it alive.
 */
const waitForFill = function waitForFill(
	fill: InflightFill,
	options: Pick<
		FetchCachedManifestOptions,
		'onBackgroundRevalidate' | 'timeoutMs'
	>
): Promise<CachedManifestResponse> {
	if (options.timeoutMs === undefined || !Number.isFinite(options.timeoutMs)) {
		return fill.promise;
	}
	// A caller's budget can already be spent; report that as 0 ms, not less.
	const timeoutMs = Math.max(0, options.timeoutMs);
	const giveUp = function giveUp(): ManifestUnavailableError {
		// Observe the abandoned fill even when nothing keeps it alive, so its
		// failure is not reported as an unhandled rejection.
		const background = settle(fill.promise);
		if (options.onBackgroundRevalidate) {
			try {
				options.onBackgroundRevalidate(background);
			} catch {
				// Registration is best effort; the fill runs either way.
			}
		}
		return new ManifestUnavailableError(
			'timeout',
			`inth manifest cache: no manifest within ${timeoutMs} ms; the request continues in the background.`
		);
	};
	const remaining = fill.startedAt + timeoutMs - Date.now();
	if (remaining <= 0) {
		// Joined a fill that already ran past the budget: the upstream is
		// slow, so answer now rather than add to the wait.
		return Promise.reject(giveUp());
	}
	return raceTimer(fill.promise, remaining, giveUp);
};

/**
 * Fetches the manifest through the in-process cache. This is the one
 * manifest-cache entry point; every server adapter calls it, and without a
 * `cache` option they all share one process cache.
 *
 * Cache key: the URL from {@link createManifestRequestUrl} (source URL plus
 * `query`, parameters sorted, fragment dropped), followed by `#<sha-256>` of
 * the caller's `headers` when any differ from the defaults the cache sends.
 * `fetch`, `init`, `timeoutMs` and `onBackgroundRevalidate` never change the
 * key. The upstream request goes to the source URL and `query` as written.
 *
 * Serves a fresh entry without a network round-trip. Once `s-maxage` has
 * passed, a stale entry inside the backend's `stale-while-revalidate`
 * window is still returned at once while one background request
 * revalidates it with `If-None-Match`; a failed or timed-out revalidation
 * leaves the stale entry in place and is retried no sooner than
 * {@link MANIFEST_DEDUPE_TTL_SECONDS} later. Past that window, or with no
 * such directive, the caller waits on the upstream as for a miss; a stale
 * entry is never served past its window.
 * Concurrent misses for the same key share one upstream request, sent to
 * the first caller's URL, so a cold start or an expiry under load reaches
 * the backend once.
 *
 * When that upstream request fails with nothing servable cached, the key is
 * not asked again for {@link MANIFEST_FAILURE_RETRY_MIN_MS}, doubling with
 * each consecutive failure up to {@link MANIFEST_FAILURE_RETRY_MAX_MS}; calls
 * in between reject at once. With `timeoutMs`, a call stops waiting for the
 * upstream after that long and the request finishes in the background.
 *
 * @returns The cached or freshly fetched manifest with its upstream headers.
 * @throws {ManifestUnavailableError} When `timeoutMs` runs out, or the key is
 * inside its retry floor after a failure.
 * @throws {Error} When no fetch implementation is available, the backend
 * responds with a non-2xx status, or the request times out after
 * {@link MANIFEST_FETCH_TIMEOUT_MS}.
 */
export const fetchCachedManifest = async function fetchCachedManifest(
	options: FetchCachedManifestOptions
): Promise<CachedManifestResponse> {
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		throw new Error('inth manifest cache: a fetch implementation is required.');
	}

	const cache = options.cache ?? defaultManifestCache;
	const requestUrl = createManifestFetchUrl(options);
	assertCredentialTransport(requestUrl, options.headers);
	// Read before the first await so a clear that lands while the key is
	// being digested still invalidates this fill.
	const generation = getGeneration(cache);
	const cacheKey = await buildCacheKey(
		createManifestRequestUrl(options),
		options.headers
	);
	if (getGeneration(cache) !== generation) {
		// A clear landed while the key was being digested: start over so this
		// fill can neither reuse nor register anything from before the clear.
		return fetchCachedManifest(options);
	}
	const now = options.now ?? Date.now();
	const cached = cache.get(cacheKey);
	if (!cached) {
		// The key left the cache (evicted or deleted by the host), so any
		// throttle record for it is an orphan.
		revalidateAfterByCache.get(cache)?.delete(cacheKey);
	} else if (cached.expiresAt > now) {
		return cached;
	}

	const inflight = mapFor(inflightByCache, cache);
	const pending = inflight.get(cacheKey);
	/**
	 * Starts one upstream fill and registers it as in flight. A background
	 * fill outlives the request that triggered it, so it never inherits that
	 * request's `signal`: it always gets a cache-owned controller with the
	 * default timeout.
	 */
	const startFill = function startFill(background = false): InflightFill {
		const callerSignal = background ? undefined : options.init?.signal;
		const controller = callerSignal ? undefined : new AbortController();
		const timeout = controller
			? setTimeout(() => {
					controller.abort(
						new Error(
							`inth manifest cache: fetch timed out after ${MANIFEST_FETCH_TIMEOUT_MS} ms.`
						)
					);
				}, MANIFEST_FETCH_TIMEOUT_MS)
			: undefined;
		const startedAt = Date.now();
		const request = (async () => {
			try {
				const entry = await revalidateManifest({
					cache,
					cacheKey,
					cached,
					fetchImpl,
					generation,
					headers: options.headers,
					init: controller
						? { ...options.init, signal: controller.signal }
						: options.init,
					now,
					requestUrl,
				});
				if (getGeneration(cache) === generation) {
					failuresByCache.get(cache)?.delete(cacheKey);
				}
				return entry;
			} catch (error) {
				// A background refresh keeps its stale entry and has its own floor.
				// A caller that cancelled its own request says nothing about the
				// upstream, so neither counts as a failure of the key.
				if (
					!background &&
					!callerSignal?.aborted &&
					getGeneration(cache) === generation
				) {
					recordFillFailure(
						cache,
						cacheKey,
						error,
						now + (Date.now() - startedAt)
					);
				}
				throw error;
			} finally {
				clearTimeout(timeout);
				// After a clear the map holds newer fills; leave those alone.
				if (getGeneration(cache) === generation) {
					inflight.delete(cacheKey);
				}
			}
		})();
		const fill: InflightFill = { promise: request, startedAt };
		inflight.set(cacheKey, fill);
		return fill;
	};

	if (cached && cached.staleUntil > now) {
		// Stale but inside the backend's stale-while-revalidate window: answer
		// from memory now and refresh behind the request. One fill at a time,
		// and no sooner than the dedupe floor after the last one settled, so a
		// source that keeps answering stale or keeps failing is not re-asked
		// on every request.
		const revalidateAfter = mapFor(revalidateAfterByCache, cache);
		if (!pending && (revalidateAfter.get(cacheKey) ?? 0) <= now) {
			// Claim the slot before the first await so concurrent stale reads
			// in the same tick do not each start a fill.
			setRevalidationFloor(cache, cacheKey, Number.POSITIVE_INFINITY);
			const revalidation = (async () => {
				// The floor counts from when the fill settles, not when it starts,
				// so a slow or timed-out upstream is not asked again at once.
				// Measured as elapsed wall time so an injected `now` still works.
				const startedAt = Date.now();
				let replacement: CachedManifestResponse | undefined;
				try {
					replacement = await startFill(true).promise;
				} catch {
					// The stale entry stays in place; the next window retries.
				} finally {
					if (getGeneration(cache) === generation) {
						const settledAt = now + (Date.now() - startedAt);
						if (replacement && replacement.expiresAt > settledAt) {
							// Fresh: `store` already cleared the floor and the entry's
							// own expiry schedules the next revalidation, even if that
							// is sooner than the floor (`s-maxage` under five seconds).
							revalidateAfter.delete(cacheKey);
						} else {
							// Failed, or answered already stale (a CDN whose origin is
							// down): hold off for the floor before asking again.
							setRevalidationFloor(
								cache,
								cacheKey,
								settledAt + MANIFEST_DEDUPE_TTL_SECONDS * 1000
							);
						}
					}
				}
			})();
			if (options.onBackgroundRevalidate) {
				try {
					options.onBackgroundRevalidate(revalidation);
				} catch {
					// A failing host registration must not turn a stale read that
					// already has an answer into an error. The refresh still runs;
					// it is only unregistered with the platform.
				}
			}
		}
		return cached;
	}

	if (pending) {
		return waitForFill(pending, options);
	}
	// Nothing servable is cached. After a failure, answer from the failure
	// record until its floor passes instead of asking a backend that is down
	// again on every request. A stale entry past its window is never served.
	assertNotBackingOff(cache, cacheKey, now);
	return waitForFill(startFill(), options);
};
