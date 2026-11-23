/**
 * The read-through cache behind the vendor list and the Additional Consent
 * provider list: concurrent misses share one fetch, a failed refresh serves
 * the last good value within its stale bound, and a failure is remembered
 * for a backoff so an endpoint outage costs one fetch per backoff instead
 * of one per init.
 */
import { boundedSet, mapFor } from '../libs/bounded-map.model';

/** A cached value, or a failed fetch remembered without one. */
export interface StaleEntry<Value> {
	/** Whether `value` holds a loaded value. */
	loaded: boolean;
	value: Value | undefined;
	/** The failure being backed off from, when the last fetch failed. */
	error?: unknown;
	/**
	 * Until when this entry is served without asking the endpoint again:
	 * the value's freshness, or the backoff after a failed fetch.
	 */
	expiresAt: number;
	/** Until when the value is served when a refresh fails. */
	staleUntil: number;
}

export type StaleCache<Value> = Map<string, StaleEntry<Value>>;

/** A loaded value and how long to keep it, in milliseconds. */
export interface Loaded<Value> {
	value: Value;
	/** Served without a fetch for this long. `0` or less stores nothing. */
	freshMs: number;
	/** Served after a failed refresh for this long. */
	staleMs: number;
}

export interface ReadThroughOptions<Value> {
	cache: StaleCache<Value>;
	key: string;
	now: number;
	/** Most entries the cache keeps; the oldest goes first. */
	maxEntries: number;
	/** How long a failed fetch is remembered before the next one. */
	backoffMs: number;
	/** Fetches the value. Throws on failure. */
	load: () => Promise<Loaded<Value>>;
	/** The answer to a failure with no stale value: a value, or a throw. */
	fallback: (error: unknown) => Value;
}

const inflightByCache = new WeakMap<
	StaleCache<unknown>,
	Map<string, Promise<unknown>>
>();

/**
 * Drops every entry and forgets fills in flight, so a fill that started
 * before the clear cannot store its value.
 */
export const clearStaleCache = function clearStaleCache(
	cache: StaleCache<unknown>
): void {
	cache.clear();
	inflightByCache.delete(cache);
};

/** Reads `key` through `cache`, fetching with `load` when it is not fresh. */
export const readThrough = function readThrough<Value>(
	options: ReadThroughOptions<Value>
): Promise<Value> {
	const { cache, key, now } = options;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > now) {
		return cached.loaded
			? Promise.resolve(cached.value as Value)
			: new Promise((resolve) => {
					resolve(options.fallback(cached.error));
				});
	}
	const stale = cached?.loaded === true && cached.staleUntil > now;
	if (cached && !stale) {
		cache.delete(key);
	}
	const inflight = mapFor(inflightByCache, cache as StaleCache<unknown>);
	const pending = inflight.get(key);
	if (pending) {
		return pending as Promise<Value>;
	}
	// A cleared cache belongs to newer requests; an old fill cannot repopulate it.
	const current = () => inflightByCache.get(cache) === inflight;
	const run = (async () => {
		try {
			const loaded = await options.load();
			if (current()) {
				if (loaded.freshMs > 0) {
					boundedSet(
						cache,
						key,
						{
							expiresAt: now + loaded.freshMs,
							loaded: true,
							staleUntil: now + Math.max(loaded.freshMs, loaded.staleMs),
							value: loaded.value,
						},
						options.maxEntries
					);
				} else {
					cache.delete(key);
				}
			}
			return loaded.value;
		} catch (error) {
			const staleUntil = stale && cached ? cached.staleUntil : 0;
			if (current()) {
				boundedSet(
					cache,
					key,
					{
						error,
						expiresAt: stale
							? Math.min(now + options.backoffMs, staleUntil)
							: now + options.backoffMs,
						loaded: stale,
						staleUntil,
						value: stale ? cached?.value : undefined,
					},
					options.maxEntries
				);
			}
			return stale ? (cached?.value as Value) : options.fallback(error);
		} finally {
			inflight.delete(key);
		}
	})();
	inflight.set(key, run);
	return run;
};
