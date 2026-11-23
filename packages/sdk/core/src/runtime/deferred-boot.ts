/**
 * `@inth/sdk/runtime/deferred-boot`: the part of
 * `@inth/sdk/runtime/deferred-snapshot` a client-rendered provider needs
 * for its first render, before the `/v1/consent/init` answer is read.
 *
 * It finds or starts the `/v1/consent/init` request, tells a returning visitor apart,
 * and builds the pending snapshot hooks read until the stand-in has the
 * policy. None of it evaluates records or resolves a policy, so it stays
 * small: reading the `/v1/consent/init` answer (`snapshotFromPrefetchedInit`) lives
 * in `deferred-snapshot`, which a provider can load after the page.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelOverrides } from '../consent-kernel.model';
import { readCookieValueFromHeader } from '../libs/cookie/read-cookie-value-from-header';
import { hasStoredConsentRecord } from '../libs/journey.store';
import { PREFETCH_WINDOW_KEY } from '../libs/page-globals';
import { primeInitRequest } from '../libs/prefetch/prefetch';
import type { PrefetchOptions } from '../libs/prefetch/prefetch.model';
import { hasGlobalPrivacyControlSignal } from '../libs/read-global-privacy-control';
import { DEFAULT_INIT_CREDENTIALS } from '../libs/request-context-headers.model';
import { resolveStorageKeys } from '../libs/storage-keys';
import type { SSRInitialData } from '../options/ssr-options.model';
import { readHostedMode } from '../transports/hosted-modes.model';
import type { ProviderTransportFactory } from '../transports/mode';

export { hasGlobalPrivacyControlSignal } from '../libs/read-global-privacy-control';
export { primeInitRequest } from '../libs/prefetch/prefetch';

export { pendingBootSnapshot } from './pending-snapshot';
export type { PendingSnapshotOptions } from './pending-snapshot';

/**
 * {@link findPrefetchedInit} from a backend URL, for a caller with no
 * `hosted()` factory to hand, such as the script tag's init script. The
 * transport must have no custom init URL, headers, `fetch` or initial
 * data; the caller checks that.
 *
 * @param url - The backend URL the transport is given.
 * @returns The pending response, or `undefined` when no inline prefetch
 * matches it.
 * @internal
 */
export const findPrefetchedInitFor = function findPrefetchedInitFor(
	url: string,
	overrides?: KernelOverrides
): Promise<SSRInitialData | undefined> | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	let projectUrl: string;
	try {
		projectUrl = new URL(url, window.location.origin).href;
	} catch {
		return undefined;
	}
	if (projectUrl.endsWith('/')) {
		projectUrl = projectUrl.slice(0, -1);
	}
	const entries = (
		window as unknown as Record<
			string,
			| Record<
					string,
					{
						promise: Promise<SSRInitialData | undefined>;
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
			requestContext.projectUrl === projectUrl &&
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
 * The prefetched `/v1/consent/init` response the engine's `hosted()` transport will
 * take, without taking it.
 *
 * @returns The pending response, or `undefined` when `mode` is not
 * `hosted()` or no inline prefetch matches it.
 * @internal
 */
export const findPrefetchedInit = function findPrefetchedInit(
	mode: ProviderTransportFactory,
	overrides?: KernelOverrides
): Promise<SSRInitialData | undefined> | undefined {
	const hosted = readHostedMode(mode);
	// A custom init URL, headers or `fetch` send a request of their own
	// (the transport reads the page's prefetch only without them), so there
	// is nothing to read.
	if (
		typeof window === 'undefined' ||
		!hosted?.projectUrl ||
		hosted.initialData ||
		hosted.initUrl ||
		hosted.fetch ||
		Object.keys(hosted.headers ?? {}).length > 0
	) {
		return undefined;
	}
	return findPrefetchedInitFor(hosted.projectUrl, overrides);
};

/**
 * {@link startPrefetchedInit} for a provider that set only `projectUrl`,
 * whose hosted transport the engine builds later. Needs no transport
 * factory, so a deferred provider's first load carries none.
 *
 * @param request - The provider's `journey` setting and consent storage key.
 * @returns The pending response, or `undefined` outside a browser or for an
 * invalid backend URL.
 * @internal
 */
export const startPrefetchedHostedInit = function startPrefetchedHostedInit(
	projectUrl: string,
	overrides?: KernelOverrides,
	request: Pick<PrefetchOptions, 'journey' | 'storageKey'> = {}
): Promise<SSRInitialData | undefined> | undefined {
	if (typeof window === 'undefined' || !projectUrl) {
		return undefined;
	}
	const found = findPrefetchedInitFor(projectUrl, overrides);
	if (found) {
		return found;
	}
	try {
		primeInitRequest({ projectUrl, ...request, overrides });
	} catch {
		// An invalid backend URL: the engine reports it.
		return undefined;
	}
	return findPrefetchedInitFor(projectUrl, overrides);
};

/**
 * Starts the `/v1/consent/init` request a `hosted()` mode's transport would send
 * first, as an inline prefetch script would have, unless one is already
 * on the page, and returns it as {@link findPrefetchedInit} reads it. The
 * transport then takes that response instead of sending its own.
 *
 * For a page whose HTML started no request (no `consentManifest()` or
 * `buildPrefetchScript()`): a deferred provider starts it as it first
 * renders, so the banner can show from the answer before the engine's
 * chunk arrives.
 *
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
): Promise<SSRInitialData | undefined> | undefined {
	const found = findPrefetchedInit(mode, overrides);
	const hosted = readHostedMode(mode);
	if (
		found ||
		typeof window === 'undefined' ||
		!hosted?.projectUrl ||
		hosted.initialData ||
		hosted.initUrl ||
		hosted.fetch ||
		Object.keys(hosted.headers ?? {}).length > 0
	) {
		return found;
	}
	return startPrefetchedHostedInit(hosted.projectUrl, overrides, request);
};

/**
 * Whether a consent record or notice dismissal is stored, without decoding
 * it: a returning visitor, whose engine should not wait.
 *
 * @returns `true` when one is present.
 * @internal
 */
const hasStoredAccountRecord = function hasStoredAccountRecord(
	storageKey?: string
): boolean {
	const keys = resolveStorageKeys(storageKey ? { storageKey } : undefined);
	try {
		if (
			typeof window !== 'undefined' &&
			window.localStorage?.getItem(keys.accountState) !== null
		) {
			return true;
		}
	} catch {
		// Blocked localStorage: check cookies below.
	}
	try {
		if (typeof document !== 'undefined') {
			const header = document.cookie;
			for (const name of [
				keys.accountChoices,
				keys.accountVendors,
				keys.accountOptOut,
			]) {
				const value = readCookieValueFromHeader(header, name);
				if (value !== undefined && value !== '') {
					return true;
				}
			}
		}
	} catch {
		// Blocked cookies.
	}
	return false;
};

export const hasStoredConsent = function hasStoredConsent(
	storageKey?: string
): boolean {
	return (
		hasStoredConsentRecord(storageKey) || hasStoredAccountRecord(storageKey)
	);
};
