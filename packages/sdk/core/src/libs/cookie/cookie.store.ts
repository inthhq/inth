/**
 * @packageDocumentation
 * Low-level cookie operations.
 */

import {
	cookieDomainsOf,
	getRootDomain,
	resolveCookieDomain,
} from './resolve-cookie-domain';
import { readCookieValueFromHeader } from './read-cookie-value-from-header';
import type { StorageConfig } from './cookie.model';

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
	value: string,
	config?: StorageConfig
): CookieWriteReport {
	if (typeof document === 'undefined') {
		return { attempted: false, verified: false };
	}

	try {
		const date = new Date();
		const expiryDays = config?.defaultExpiryDays ?? 365;
		date.setTime(date.getTime() + expiryDays * 24 * 60 * 60 * 1000);
		const parts = [
			`${name}=${value}`,
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
	return { attempted: true, verified: readBack === value };
};

/**
 * {@link writeCookie}, warning instead of reporting when the assignment
 * throws.
 *
 * @internal
 */
export const setCookie = function setCookie(
	name: string,
	value: string,
	config?: StorageConfig
): void {
	const report = writeCookie(name, value, config);
	if (!report.attempted && report.error !== undefined) {
		console.warn(`Failed to set cookie "${name}":`, report.error);
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

/**
 * Expires `name` host-only and at every parent domain of the page's host,
 * and at `config.defaultDomain`, at path `/`: for a cookie another store
 * or an earlier configuration may have scoped anywhere this page reads it.
 * Writes nothing when the page is sent no such cookie.
 *
 * @internal
 */
export const deleteCookieInEveryScope = function deleteCookieInEveryScope(
	name: string,
	config?: StorageConfig
): void {
	if (getRawCookieValue(name) === null) {
		return;
	}
	// `''` is host-only.
	const domains = new Set([
		'',
		getRootDomain(),
		...cookieDomainsOf(window.location.hostname),
		config?.defaultDomain ?? '',
	]);
	for (const domain of domains) {
		deleteCookie(name, { defaultDomain: domain });
	}
};
