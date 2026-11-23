/**
 * Which request headers carry a visitor's identity, and what follows from
 * it: identity never crosses a cleartext link to a remote host, and a
 * response that may vary by it never reaches a shared cache. The consent
 * proxy, the consent route and the manifest cache read these one set.
 *
 * @internal
 */
import { CONSENT_REQUEST_HEADER_NAMES } from '@inth/sdk-schema/types';

/** Headers that carry credentials and must never cross a cleartext link. */
export const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
	'authorization',
	'cookie',
	'proxy-authorization',
]);

/**
 * Browser request headers that carry no visitor identity: the negotiation
 * headers, `origin` with `sec-fetch-site`, GPC and the consent resolver
 * inputs.
 */
export const PUBLIC_REQUEST_HEADERS: readonly string[] = [
	'accept',
	'accept-language',
	'content-type',
	'if-none-match',
	'origin',
	'referer',
	'sec-fetch-site',
	'user-agent',
	'sec-gpc',
	...CONSENT_REQUEST_HEADER_NAMES,
];

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
	'localhost',
	'127.0.0.1',
	'[::1]',
	'::1',
]);

/**
 * The first header name that carries identity: a credential, or any name
 * outside `publicNames` (an API key, a tenant selector).
 *
 * @param publicNames - Lower-case names known to carry no identity.
 */
export const identityHeaderOf = function identityHeaderOf(
	names: Iterable<string>,
	publicNames: ReadonlySet<string>
): string | undefined {
	for (const name of names) {
		const lower = name.toLowerCase();
		if (CREDENTIAL_HEADERS.has(lower) || !publicNames.has(lower)) {
			return name;
		}
	}
	return undefined;
};

/**
 * Whether a URL is `http:` to a host other than loopback.
 *
 * @returns `true` for a cleartext remote target; `false` for anything
 * else, an unparseable URL included.
 */
export const isCleartextRemoteURL = function isCleartextRemoteURL(
	url: string
): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname);
	} catch {
		return false;
	}
};

/**
 * Marks a response that may vary by a forwarded identity as private, so a
 * shared cache keyed by URL never hands it to the next visitor.
 */
export const markResponsePrivate = function markResponsePrivate(
	headers: Headers
): void {
	headers.set('cache-control', 'private, no-store');
	headers.delete('etag');
	headers.delete('last-modified');
};
