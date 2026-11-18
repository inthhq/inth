import { resolveRequestProjectUrl } from '@inth/sdk/server';

const ABSOLUTE_URL_REGEX = /^https?:\/\//u;

const trimTrailingSlash = function trimTrailingSlash(url: string): string {
	// Don't trim if it's just the root path "/"
	if (url === '/') {
		return url;
	}

	// Remove trailing slash if present
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

/**
 * Validates and normalizes a backend URL.
 *
 * @param projectUrl - The URL to validate (absolute or relative)
 * @returns An object with isAbsolute flag and the normalized URL
 * @throws {Error} If the URL format is invalid
 *
 * @example
 * ```ts
 * validateProjectUrl('https://api.example.com/');
 * // Returns: { isAbsolute: true, normalizedUrl: 'https://api.example.com' }
 *
 * validateProjectUrl('/api/consent/');
 * // Returns: { isAbsolute: false, normalizedUrl: '/api/consent' }
 * ```
 *
 * @public
 */
export const validateProjectUrl = function validateProjectUrl(
	projectUrl: string
): {
	isAbsolute: boolean;
	normalizedUrl: string;
} {
	// Check if URL is absolute (starts with protocol)
	const isAbsolute = ABSOLUTE_URL_REGEX.test(projectUrl);

	if (isAbsolute) {
		// Validate that the URL is valid
		String(new URL(projectUrl));

		return {
			isAbsolute: true,
			normalizedUrl: trimTrailingSlash(projectUrl),
		};
	}

	if (projectUrl.startsWith('/')) {
		return {
			isAbsolute: false,
			normalizedUrl: trimTrailingSlash(projectUrl),
		};
	}

	throw new Error(
		`Invalid URL format: ${projectUrl}. URL must be absolute (https://...) or relative starting with (/)`
	);
};

/**
 * Normalizes a backend URL, resolving relative URLs against the request.
 *
 * @remarks
 * For absolute URLs, returns the URL as-is (with trailing slash trimmed).
 * A relative URL resolves against the `host` header: over `https` for a
 * domain name, and over `http` for `localhost`, an IP address or a
 * single-label host. `x-forwarded-host`, `x-forwarded-proto` and `forwarded`
 * are read only when `trustForwardedHeaders` is set, because any client can
 * send them; the `referer` header is never used.
 *
 * @param projectUrl - The backend URL (absolute or relative)
 * @param headersList - The Headers object from the incoming request
 * @param options - `trustForwardedHeaders`: resolve against the request's
 * forwarding headers. Set it only behind a proxy that sets them and drops
 * incoming ones.
 * @returns The normalized absolute URL, or null if it cannot be determined
 *
 * @example
 * ```ts
 * import { normalizeProjectUrl } from '@inth/react/server';
 *
 * // Absolute URL - returns as-is
 * normalizeProjectUrl('https://api.example.com/', headers);
 * // Returns: 'https://api.example.com'
 *
 * // Relative URL - resolved from the host header
 * normalizeProjectUrl('/api/consent', headers);
 * // Returns: 'https://example.com/api/consent' (for `host: example.com`)
 * ```
 *
 * @public
 */
export const normalizeProjectUrl = function normalizeProjectUrl(
	projectUrl: string,
	headersList: Headers,
	options: { trustForwardedHeaders?: boolean } = {}
): string | null {
	return resolveRequestProjectUrl(projectUrl, {
		headers: headersList,
		trustForwardedHeaders: options.trustForwardedHeaders,
	});
};
