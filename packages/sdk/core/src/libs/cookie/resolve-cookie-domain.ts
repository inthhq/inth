/**
 * @packageDocumentation
 * Domain and configuration utilities for cookie storage.
 */

import type { StorageConfig } from './cookie.model';

/**
 * The domains a cookie for `hostname` can be scoped to: the host and every
 * parent domain of it with at least two labels, as in `a.app.example.com`,
 * `app.example.com`, `example.com`. None for `localhost`, another
 * single-label host, or an IP address, which take host-only cookies.
 *
 * @param hostname - A hostname without a port.
 * @returns The domains, longest first.
 *
 * @internal
 */
export const cookieDomainsOf = function cookieDomainsOf(
	hostname: string
): string[] {
	if (
		!hostname.includes('.') ||
		/^[\d.]+$/u.test(hostname) ||
		hostname.includes(':')
	) {
		return [];
	}
	const labels = hostname.split('.');
	return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
};

/**
 * The cookie domain {@link getRootDomain} picks for a hostname: the
 * hostname itself when it takes host-only cookies, else the last two
 * labels with a leading dot (`co.uk` and its like are not special-cased).
 * A server uses it to set a cookie the browser would set.
 *
 * @param hostname - A hostname without a port.
 * @returns Root domain, e.g. `.example.com` for `app.example.com`.
 *
 * @internal
 */
export const rootDomainOf = function rootDomainOf(hostname: string): string {
	const root = cookieDomainsOf(hostname).at(-1);
	return root === undefined ? hostname : `.${root}`;
};

/**
 * Gets the root domain for cross-subdomain cookies.
 *
 * @returns Root domain with leading dot (e.g., '.example.com')
 *
 * @remarks
 * Use this helper to enable consent sharing across all subdomains.
 * For example, if you want consent on app.example.com to apply to www.example.com.
 *
 * @example
 * ```typescript
 * // Enable cross-subdomain consent
 * createPersistence({ kernel, storageConfig: { defaultDomain: getRootDomain() } });
 * ```
 *
 * @public
 */
export const getRootDomain = function getRootDomain(): string {
	if (typeof window === 'undefined') {
		return '';
	}
	return rootDomainOf(window.location.hostname);
};

/**
 * The `domain` attribute for a cookie written or deleted under `config`:
 * the root domain with `crossSubdomain`, else `defaultDomain`, else `''`
 * (host-only).
 *
 * @internal
 */
export const resolveCookieDomain = function resolveCookieDomain(
	config?: StorageConfig
): string {
	return config?.crossSubdomain
		? getRootDomain()
		: (config?.defaultDomain ?? '');
};
