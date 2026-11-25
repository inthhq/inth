/**
 * The last `/v1/consent/init` policy a visitor with a stored choice saw, kept so the
 * next page's init script can start the scripts that choice allows before
 * `/v1/consent/init` answers again.
 *
 * Written only once the visitor has a stored choice, so a visitor who never
 * answered stores nothing. It holds the policy resolution and location the
 * backend sent, no visitor data. The init script evaluates the stored
 * choice against it with the kernel's own code, so a decision made under
 * another policy (another fingerprint) allows nothing. When `/v1/consent/init`
 * answers, the init script evaluates again with the live policy and
 * replaces the entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelOverrides } from '@inth/sdk-core';
import type { SSRInitialData } from '@inth/sdk-core/runtime/deferred-snapshot';

/** localStorage key of the cache. */
export const POLICY_CACHE_KEY = 'inth-init-policy';

/** Entries older than this are ignored. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedPolicy {
	/** Backend URL and overrides the response answered. */
	k: string;
	/** When it was stored. */
	t: number;
	/** The response's policy fields. */
	i: Record<string, unknown>;
}

const keyOf = (projectUrl: string, overrides?: KernelOverrides): string =>
	[
		projectUrl,
		overrides?.country ?? '',
		overrides?.region ?? '',
		overrides?.language ?? '',
	].join('|');

/** The stored entry for `key`, fresh or not, or `undefined`. */
const readEntry = (key: string): CachedPolicy | undefined => {
	try {
		const entry = JSON.parse(
			window.localStorage.getItem(POLICY_CACHE_KEY) ?? 'null'
		) as CachedPolicy | null;
		return entry?.k === key ? entry : undefined;
	} catch {
		// Blocked or unreadable storage: nothing cached.
		return undefined;
	}
};

const store = (entry: CachedPolicy): void => {
	try {
		window.localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify(entry));
	} catch {
		// Full or blocked storage: the next page waits for `/v1/consent/init`.
	}
};

const isUnavailable = (registry: unknown): boolean =>
	typeof registry === 'object' &&
	registry !== null &&
	(registry as { unavailable?: unknown }).unavailable === true;

/**
 * The cached response for this backend and overrides, shaped as a
 * prefetch result `snapshotFromPrefetchedInit` reads, or `undefined`.
 */
export const readPolicyCache = function readPolicyCache(
	projectUrl: string,
	overrides?: KernelOverrides
): SSRInitialData | undefined {
	const entry = readEntry(keyOf(projectUrl, overrides));
	return entry && Date.now() - entry.t < MAX_AGE_MS
		? ({ init: entry.i } as unknown as SSRInitialData)
		: undefined;
};

/** Keep the policy fields of a `/v1/consent/init` response. */
export const writePolicyCache = function writePolicyCache(
	projectUrl: string,
	overrides: KernelOverrides | undefined,
	data: SSRInitialData
): void {
	const init = data.init as unknown as Record<string, unknown> | undefined;
	if (!init?.policyResolution) {
		return;
	}
	const key = keyOf(projectUrl, overrides);
	// A registry the server could not read never replaces the last list,
	// while that list is fresh enough to read.
	const scriptRegistry = isUnavailable(init.scriptRegistry)
		? (
				readPolicyCache(projectUrl, overrides)?.init as
					| { scriptRegistry?: unknown }
					| undefined
			)?.scriptRegistry
		: init.scriptRegistry;
	store({
		i: {
			branding: init.branding,
			hosting: init.hosting,
			location: init.location,
			policyResolution: init.policyResolution,
			policySnapshotToken: init.policySnapshotToken,
			scriptRegistry,
		},
		k: key,
		t: Date.now(),
	});
};

/**
 * Replace the cached entry's script registry with the one the engine has
 * now, such as an empty `load` list from a later answer, so the next page
 * does not start scripts the server stopped listing. Does nothing without
 * an entry for this backend and overrides, or for an unavailable registry.
 */
export const updatePolicyCacheRegistry = function updatePolicyCacheRegistry(
	projectUrl: string,
	overrides: KernelOverrides | undefined,
	registry: unknown
): void {
	const entry = readEntry(keyOf(projectUrl, overrides));
	if (!entry || isUnavailable(registry)) {
		return;
	}
	const scriptRegistry = registry ?? undefined;
	if (
		JSON.stringify(entry.i.scriptRegistry) === JSON.stringify(scriptRegistry)
	) {
		return;
	}
	store({ ...entry, i: { ...entry.i, scriptRegistry } });
};

/**
 * Follows the script registry the engine applies, for the cache. Only a
 * registry that differs from the one the engine started with counts: the
 * start is the init script's answer or the cache, or nothing when an
 * unavailable answer kept it so, and writing that back would add nothing
 * or wipe the cached list.
 *
 * @param initial - The engine's registry when it took over.
 * @internal
 */
export const createRegistryTracker = function createRegistryTracker(
	initial: unknown
) {
	let last = initial;
	let changed = false;
	return {
		/** The registry the engine applied since it started, if it applied one. */
		get applied(): { registry: unknown } | undefined {
			return changed ? { registry: last } : undefined;
		},
		/** Record a snapshot; `true` when it applied a new registry. */
		observe(next: {
			policyPending: boolean;
			scriptRegistry: unknown;
		}): boolean {
			if (next.policyPending || next.scriptRegistry === last) {
				return false;
			}
			last = next.scriptRegistry;
			changed = true;
			return true;
		},
	};
};
