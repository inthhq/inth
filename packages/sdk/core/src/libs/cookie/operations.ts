/**
 * @packageDocumentation
 * Low-level cookie operations.
 */

import { resolveCookieDomain } from './domain-utils';
import { expandFlatKeys, shortenFlatKeys } from './key-mapping';
import { readCookieValueFromHeader } from './read-header';
import {
	flatToString,
	flattenObject,
	stringToFlat,
	unflattenObject,
} from './serialization';
import type { StorageConfig } from './types';

/**
 * Outcome of one attempt to store a cookie.
 *
 * `attempted` is true when the `document.cookie` assignment ran without
 * throwing. `verified` is true when the value read back immediately
 * afterwards equals what was written. A browser can accept the
 * assignment and still drop the cookie (size, policy, blocked storage),
 * which shows up as `attempted: true, verified: false`. A thrown
 * assignment is `attempted: false` with the error attached.
 *
 * @internal
 */
export interface CookieWriteReport {
	attempted: boolean;
	verified: boolean;
	error?: unknown;
}

const serializeCookieValue = function serializeCookieValue(
	value: unknown
): string {
	if (typeof value === 'string') {
		return value;
	}
	const flattened = flattenObject(value as Record<string, unknown>);
	const shortened = shortenFlatKeys(flattened);
	return flatToString(shortened);
};

/**
 * Writes a cookie and reports what happened instead of swallowing it.
 *
 * Shared by {@link setCookie}, which keeps its void, warn-on-failure
 * contract, and by the v3 record writer, which must not report a cookie
 * as stored when the assignment threw or the browser dropped it.
 *
 * @internal
 */
export const writeCookie = function writeCookie(
	name: string,
	value: unknown,
	config?: StorageConfig
): CookieWriteReport {
	if (typeof document === 'undefined') {
		return { attempted: false, verified: false };
	}

	let cookieValue: string;
	try {
		cookieValue = serializeCookieValue(value);

		const date = new Date();
		const expiryDays = config?.defaultExpiryDays ?? 365;
		date.setTime(date.getTime() + expiryDays * 24 * 60 * 60 * 1000);
		const parts = [
			`${name}=${cookieValue}`,
			`expires=${date.toUTCString()}`,
			'path=/',
		];
		const domain = resolveCookieDomain(config);
		if (domain) {
			parts.push(`domain=${domain}`);
		}
		if (
			typeof window !== 'undefined' &&
			window.location.protocol === 'https:'
		) {
			parts.push('secure');
		}
		parts.push('SameSite=Lax');

		document.cookie = parts.join('; ');
	} catch (error) {
		return { attempted: false, error, verified: false };
	}

	let readBack: string | undefined;
	try {
		readBack = readCookieValueFromHeader(document.cookie, name);
	} catch {
		readBack = undefined;
	}
	return { attempted: true, verified: readBack === cookieValue };
};

/**
 * @param value - Cookie value (will be flattened to compact string format)
 *
 * @remarks
 * Uses a flat key:value,key:value format without JSON special characters.
 * This avoids issues with curly braces, quotes, and simplifies encoding.
 * Only colons and commas are used as delimiters.
 *
 * @internal
 */
export const setCookie = function setCookie(
	name: string,
	value: unknown,
	config?: StorageConfig
): void {
	const report = writeCookie(name, value, config);
	if (!report.attempted && report.error !== undefined) {
		console.warn(`Failed to set cookie "${name}":`, report.error);
	}
};

/**
 * Parses a stored Inth cookie value using the same compact format that
 * `setCookie` writes. This is safe for server adapters that already have the
 * raw cookie value from a request header and cannot read `document.cookie`.
 *
 * @internal
 */
export const parseCookieValue = function parseCookieValue<ReturnType = unknown>(
	cookieValue: string
): ReturnType | null {
	try {
		if (cookieValue.includes(':')) {
			const shortened = stringToFlat(cookieValue);
			const expanded = expandFlatKeys(shortened);
			const nested = unflattenObject(expanded);
			return nested as ReturnType;
		}

		return cookieValue as ReturnType;
	} catch (error) {
		console.warn('Failed to parse cookie value:', error);
		return null;
	}
};

/**
 * Reads one cookie's raw value from `document.cookie` without parsing it.
 *
 * @param onUnavailable - Called when browser cookies cannot be read.
 * @returns The raw value, or `null` outside the browser, when the cookie
 * is absent, or when `document.cookie` cannot be read.
 *
 * @remarks
 * Read-only. Callers that need to tell the v2 compact format apart from
 * a versioned v3 envelope must see the bytes before any parser guesses.
 *
 * @internal
 */
export const getRawCookieValue = function getRawCookieValue(
	name: string,
	onUnavailable?: () => void
): string | null {
	if (typeof document === 'undefined') {
		onUnavailable?.();
		return null;
	}

	try {
		return readCookieValueFromHeader(document.cookie, name) ?? null;
	} catch (error) {
		console.warn(`Failed to get cookie "${name}":`, error);
		onUnavailable?.();
		return null;
	}
};

/**
 * @returns Parsed cookie value or null if not found
 *
 * @internal
 */
export const getCookie = function getCookie<ReturnType = unknown>(
	name: string
): ReturnType | null {
	if (typeof document === 'undefined') {
		return null;
	}

	try {
		const nameEQ = `${name}=`;
		const cookies = document.cookie.split(';');

		for (const cookie of cookies) {
			let c = cookie;
			while (c.charAt(0) === ' ') {
				c = c.substring(1);
			}

			if (c.indexOf(nameEQ) === 0) {
				const cookieValue = c.substring(nameEQ.length);
				return parseCookieValue<ReturnType>(cookieValue);
			}
		}

		return null;
	} catch (error) {
		console.warn(`Failed to get cookie "${name}":`, error);
		return null;
	}
};

/**
 * Expires a cookie at the domain {@link resolveCookieDomain} picks for
 * `config`, at path `/`.
 *
 * @internal
 */
export const deleteCookie = function deleteCookie(
	name: string,
	config?: StorageConfig
): void {
	if (typeof document === 'undefined') {
		return;
	}

	try {
		const parts = [
			`${name}=`,
			'expires=Thu, 01 Jan 1970 00:00:00 GMT',
			'path=/',
		];
		const domain = resolveCookieDomain(config);
		if (domain) {
			parts.push(`domain=${domain}`);
		}

		document.cookie = parts.join('; ');
	} catch (error) {
		console.warn(`Failed to delete cookie "${name}":`, error);
	}
};
