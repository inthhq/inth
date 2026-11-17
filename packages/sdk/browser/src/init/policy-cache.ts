/**
 * The last `/init` policy a visitor with a stored choice saw, kept so the
 * next page's init script can start the scripts that choice allows before
 * `/init` answers again.
 *
 * Written only once the visitor has a stored choice, so a visitor who never
 * answered stores nothing. It holds the policy resolution and location the
 * backend sent, no visitor data. The init script evaluates the stored
 * choice against it with the kernel's own code, so a decision made under
 * another policy (another fingerprint) allows nothing. When `/init`
 * answers, the init script evaluates again with the live policy and
 * replaces the entry.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelOverrides } from '@c15t/core';
import type { PrefetchedInitialData } from '@c15t/core/runtime/deferred-snapshot';

/** localStorage key of the cache. */
export const POLICY_CACHE_KEY = 'c15t-init-policy';

/** Entries older than this are ignored. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedPolicy {
	/** Backend URL and overrides the response answered. */
	k: string;
	/** When it was stored. */
	t: number;
	/** The response's policy fields. */
	i: Record<string, unknown>;
	/** The producer's policy contract header. */
	c: string | null | undefined;
}

const keyOf = (backendURL: string, overrides?: KernelOverrides): string =>
	[
		backendURL,
		overrides?.country ?? '',
		overrides?.region ?? '',
		overrides?.language ?? '',
	].join('|');

/**
 * The cached response for this backend and overrides, shaped as a
 * prefetch result `snapshotFromPrefetchedInit` reads, or `undefined`.
 *
 * @param backendURL - The backend URL the page uses.
 * @param overrides - The page's overrides.
 * @returns The cached response, or `undefined`.
 */
export const readPolicyCache = function readPolicyCache(
	backendURL: string,
	overrides?: KernelOverrides
): PrefetchedInitialData | undefined {
	try {
		const entry = JSON.parse(
			window.localStorage.getItem(POLICY_CACHE_KEY) ?? 'null'
		) as CachedPolicy | null;
		if (
			entry?.k === keyOf(backendURL, overrides) &&
			Date.now() - entry.t < MAX_AGE_MS
		) {
			return {
				init: entry.i,
				producerPolicyContract: entry.c,
			} as unknown as PrefetchedInitialData;
		}
	} catch {
		// Blocked or unreadable storage: nothing cached.
	}
	return undefined;
};

/**
 * Keep the policy fields of an `/init` response.
 *
 * @param backendURL - The backend URL the page uses.
 * @param overrides - The page's overrides.
 * @param data - The response.
 */
export const writePolicyCache = function writePolicyCache(
	backendURL: string,
	overrides: KernelOverrides | undefined,
	data: PrefetchedInitialData
): void {
	const init = data.init as unknown as Record<string, unknown> | undefined;
	if (!init?.policyResolution) {
		return;
	}
	const entry: CachedPolicy = {
		c: data.producerPolicyContract,
		i: {
			branding: init.branding,
			hosting: init.hosting,
			location: init.location,
			policyResolution: init.policyResolution,
			policySnapshotToken: init.policySnapshotToken,
		},
		k: keyOf(backendURL, overrides),
		t: Date.now(),
	};
	try {
		window.localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify(entry));
	} catch {
		// Full or blocked storage: the next page waits for `/init`.
	}
};
