/**
 * `@c15t/core/runtime/deferred-boot`: the part of
 * `@c15t/core/runtime/deferred-snapshot` a client-rendered provider needs
 * for its first render, before the `/init` answer is read.
 *
 * It finds or starts the `/init` request, tells a returning visitor apart,
 * and builds the pending snapshot hooks read until the stand-in has the
 * policy. None of it evaluates records or resolves a policy, so it stays
 * small: reading the `/init` answer (`snapshotFromPrefetchedInit`) lives
 * in `deferred-snapshot`, which a provider can load after the page.
 *
 * @packageDocumentation
 * @internal
 */

import { hasGlobalPrivacyControlSignal } from '../libs/global-privacy-control';
import { hasStoredConsentRecord } from '../libs/journey';
import { primeInitRequest } from '../libs/prefetch/prefetch';
import type { PrefetchedInitialData } from '../libs/prefetch/prefetch';
import type { PrefetchOptions } from '../libs/prefetch/types';
import { PREFETCH_WINDOW_KEY } from '../libs/prefetch/window-key';
import { DEFAULT_INIT_CREDENTIALS } from '../libs/request-context-headers';
import { STORAGE_KEY_V2 } from '../libs/storage-keys';
import { readHostedMode } from '../transports/hosted-modes';
import type { ProviderTransportFactory } from '../transports/mode';
import type { KernelOverrides } from '../types';

export { hasGlobalPrivacyControlSignal } from '../libs/global-privacy-control';
export { primeInitRequest } from '../libs/prefetch/prefetch';
export type { PrefetchedInitialData } from '../libs/prefetch/prefetch';

export { pendingBootSnapshot } from './pending-snapshot';
export type { PendingSnapshotOptions } from './pending-snapshot';

/**
 * {@link findPrefetchedInit} from a backend URL, for a caller with no
 * `hosted()` factory to hand, such as the script tag's init script. The
 * transport must have no custom init URL, headers, `fetch` or initial
 * data; the caller checks that.
 *
 * @param url - The backend URL the transport is given.
 * @param overrides - The location, language and GPC overrides.
 * @returns The pending response, or `undefined` when no inline prefetch
 * matches it.
 * @internal
 */
export const findPrefetchedInitFor = function findPrefetchedInitFor(
	url: string,
	overrides?: KernelOverrides
): Promise<PrefetchedInitialData | undefined> | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	let backendURL: string;
	try {
		backendURL = new URL(url, window.location.origin).href;
	} catch {
		return undefined;
	}
	if (backendURL.endsWith('/')) {
		backendURL = backendURL.slice(0, -1);
	}
	const entries = (
		window as unknown as Record<
			string,
			| Record<
					string,
					{
						promise: Promise<PrefetchedInitialData | undefined>;
						requestContext?: Record<string, unknown> | null;
					}
			  >
			| undefined
		>
	)[PREFETCH_WINDOW_KEY];
	// The request the transport's first init takes: same backend, the
	// default credentials, the GPC signal the transport reads (an override,
	// or the browser's), and no other location or language than asked.
	const gpc = overrides?.gpc ?? hasGlobalPrivacyControlSignal();
	const matches = Object.values(entries ?? {}).filter(({ requestContext }) =>
		Boolean(
			requestContext &&
			requestContext.backendURL === backendURL &&
			(requestContext.credentials ?? DEFAULT_INIT_CREDENTIALS) ===
				DEFAULT_INIT_CREDENTIALS &&
			requestContext.gpc === gpc &&
			requestContext.country === (overrides?.country ?? null) &&
			requestContext.region === (overrides?.region ?? null) &&
			requestContext.language === (overrides?.language ?? null)
		)
	);
	return matches.length === 1 ? matches[0]?.promise : undefined;
};

/**
 * The prefetched `/init` response the engine's `hosted()` transport will
 * take, without taking it.
 *
 * @param mode - The provider's `mode`.
 * @param overrides - The provider's `overrides`.
 * @returns The pending response, or `undefined` when `mode` is not
 * `hosted()` or no inline prefetch matches it.
 * @internal
 */
export const findPrefetchedInit = function findPrefetchedInit(
	mode: ProviderTransportFactory,
	overrides?: KernelOverrides
): Promise<PrefetchedInitialData | undefined> | undefined {
	const hosted = readHostedMode(mode);
	// A custom init URL, headers or `fetch` send a request of their own
	// (the transport reads the page's prefetch only without them), so there
	// is nothing to read.
	if (
		typeof window === 'undefined' ||
		!hosted?.backendURL ||
		hosted.initialData ||
		hosted.initURL ||
		hosted.fetch ||
		Object.keys(hosted.headers ?? {}).length > 0
	) {
		return undefined;
	}
	return findPrefetchedInitFor(hosted.backendURL, overrides);
};

/**
 * {@link startPrefetchedInit} for a provider that set only `backendURL`,
 * whose hosted transport the engine builds later. Needs no transport
 * factory, so a deferred provider's first load carries none.
 *
 * @param backendURL - The provider's `backendURL`.
 * @param overrides - The provider's `overrides`.
 * @param request - The provider's `journey` setting and consent storage key.
 * @returns The pending response, or `undefined` outside a browser or for an
 * invalid backend URL.
 * @internal
 */
export const startPrefetchedHostedInit = function startPrefetchedHostedInit(
	backendURL: string,
	overrides?: KernelOverrides,
	request: Pick<PrefetchOptions, 'journey' | 'storageKey'> = {}
): Promise<PrefetchedInitialData | undefined> | undefined {
	if (typeof window === 'undefined' || !backendURL) {
		return undefined;
	}
	const found = findPrefetchedInitFor(backendURL, overrides);
	if (found) {
		return found;
	}
	try {
		primeInitRequest({ backendURL, ...request, overrides });
	} catch {
		// An invalid backend URL: the engine reports it.
		return undefined;
	}
	return findPrefetchedInitFor(backendURL, overrides);
};

/**
 * Starts the `/init` request a `hosted()` mode's transport would send
 * first, as an inline prefetch script would have, unless one is already
 * on the page, and returns it as {@link findPrefetchedInit} reads it. The
 * transport then takes that response instead of sending its own.
 *
 * For a page whose HTML started no request (no `consentManifest()` or
 * `buildPrefetchScript()`): a deferred provider starts it as it first
 * renders, so the banner can show from the answer before the engine's
 * chunk arrives.
 *
 * @param mode - The provider's mode.
 * @param overrides - The provider's `overrides`.
 * @param request - The provider's `journey` setting and consent storage
 * key, which shape the request as they shape the transport's.
 * @returns The pending response, or `undefined` outside a browser and for
 * a mode whose request this cannot stand for (see
 * {@link findPrefetchedInit}), or an invalid backend URL.
 * @internal
 */
export const startPrefetchedInit = function startPrefetchedInit(
	mode: ProviderTransportFactory,
	overrides?: KernelOverrides,
	request: Pick<PrefetchOptions, 'journey' | 'storageKey'> = {}
): Promise<PrefetchedInitialData | undefined> | undefined {
	const found = findPrefetchedInit(mode, overrides);
	const hosted = readHostedMode(mode);
	if (
		found ||
		typeof window === 'undefined' ||
		!hosted?.backendURL ||
		hosted.initialData ||
		hosted.initURL ||
		hosted.fetch ||
		Object.keys(hosted.headers ?? {}).length > 0
	) {
		return found;
	}
	return startPrefetchedHostedInit(hosted.backendURL, overrides, request);
};

/**
 * Whether a consent record or notice dismissal is stored, without decoding
 * it: a returning visitor, whose engine should not wait.
 *
 * @param storageKey - The consent storage key.
 * @returns `true` when one is present.
 * @internal
 */
export const hasStoredConsent = function hasStoredConsent(
	storageKey: string = STORAGE_KEY_V2
): boolean {
	return hasStoredConsentRecord(storageKey);
};
