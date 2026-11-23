/**
 * Where the TC string and its AC string are kept between visits: the
 * `euconsent-v2` cookie (per TCF spec) and a localStorage copy.
 *
 * @packageDocumentation
 */

import { IAB_STORAGE_KEYS } from '@inth/sdk-schema/types';

const setCookie = function setCookie(
	name: string,
	value: string,
	maxAgeDays: number
): void {
	if (typeof document === 'undefined') {
		return;
	}

	const maxAge = maxAgeDays * 24 * 60 * 60;
	document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
};

const getCookie = function getCookie(name: string): string | null {
	if (typeof document === 'undefined') {
		return null;
	}

	const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`, 'u'));
	if (match?.[2]) {
		return decodeURIComponent(match[2]);
	}
	return null;
};

/**
 * Removes a superseded TC string from the `euconsent-v2` cookie and its
 * localStorage copy, so vendors reading storage directly, and
 * `loadFromStorage()`, no longer find it. Each entry is removed only while
 * it still holds `tcString`: another tab may have saved a newer one.
 *
 * @internal
 */
export const clearStoredTCString = function clearStoredTCString(
	tcString: string
): void {
	// Each store is cleared on its own: a malformed cookie must not keep the
	// localStorage copy alive.
	// The AC string goes with the TC string it was saved beside.
	try {
		if (
			typeof document !== 'undefined' &&
			getCookie(IAB_STORAGE_KEYS.tcString) === tcString
		) {
			document.cookie = `${IAB_STORAGE_KEYS.tcString}=; max-age=0; path=/; SameSite=Lax`;
			document.cookie = `${IAB_STORAGE_KEYS.additionalConsent}=; max-age=0; path=/; SameSite=Lax`;
		}
	} catch {
		// The cookie value can be malformed.
	}
	try {
		if (localStorage.getItem(IAB_STORAGE_KEYS.tcString) === tcString) {
			localStorage.removeItem(IAB_STORAGE_KEYS.tcString);
			localStorage.removeItem(IAB_STORAGE_KEYS.additionalConsent);
		}
	} catch {
		// Storage can be unavailable.
	}
};

/**
 * Rewrites the stored AC string beside `tcString` to `addtlConsent`, or
 * removes it when there is none. A list that drops a provider changes the
 * AC string of a TC string already saved, and vendors reading storage must
 * not keep finding the provider in it. Like {@link clearStoredTCString},
 * each store changes only while it still holds `tcString`.
 *
 * @internal
 */
export const syncStoredAdditionalConsent = function syncStoredAdditionalConsent(
	tcString: string,
	addtlConsent: string | undefined
): void {
	try {
		if (
			typeof document !== 'undefined' &&
			getCookie(IAB_STORAGE_KEYS.tcString) === tcString &&
			(getCookie(IAB_STORAGE_KEYS.additionalConsent) ?? undefined) !==
				addtlConsent
		) {
			setCookie(
				IAB_STORAGE_KEYS.additionalConsent,
				addtlConsent ?? '',
				addtlConsent ? 395 : 0
			);
		}
	} catch {
		// The cookie value can be malformed.
	}
	try {
		if (
			localStorage.getItem(IAB_STORAGE_KEYS.tcString) === tcString &&
			(localStorage.getItem(IAB_STORAGE_KEYS.additionalConsent) ??
				undefined) !== addtlConsent
		) {
			if (addtlConsent) {
				localStorage.setItem(IAB_STORAGE_KEYS.additionalConsent, addtlConsent);
			} else {
				localStorage.removeItem(IAB_STORAGE_KEYS.additionalConsent);
			}
		}
	} catch {
		// Storage can be unavailable.
	}
};

/**
 * Reads the stored TC string: the cookie first (per TCF spec), then the
 * localStorage copy. Returns `null` when neither holds one.
 *
 * @internal
 */
export const readStoredTCString = function readStoredTCString(): string | null {
	// Try cookie first (per TCF spec)
	const cookieValue = getCookie(IAB_STORAGE_KEYS.tcString);
	if (cookieValue) {
		return cookieValue;
	}

	if (typeof localStorage !== 'undefined') {
		try {
			const localValue = localStorage.getItem(IAB_STORAGE_KEYS.tcString);
			if (localValue) {
				return localValue;
			}
		} catch {
			// Storage not available
		}
	}

	return null;
};

/**
 * Saves `tcString` to the cookie and to localStorage, with `additional`, its
 * AC string, beside it.
 *
 * @internal
 */
export const writeStoredTCString = function writeStoredTCString(
	tcString: string,
	additional: string | undefined
): void {
	// Save to cookie (per TCF spec, 13 month expiry)
	setCookie(IAB_STORAGE_KEYS.tcString, tcString, 395);
	// The AC string is stored beside its TC string, or removed so an
	// older one is never read with the new TC string.
	if (additional) {
		setCookie(IAB_STORAGE_KEYS.additionalConsent, additional, 395);
	} else {
		setCookie(IAB_STORAGE_KEYS.additionalConsent, '', 0);
	}

	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem(IAB_STORAGE_KEYS.tcString, tcString);
			if (additional) {
				localStorage.setItem(IAB_STORAGE_KEYS.additionalConsent, additional);
			} else {
				localStorage.removeItem(IAB_STORAGE_KEYS.additionalConsent);
			}
		} catch {
			// Storage full or disabled
		}
	}
};
