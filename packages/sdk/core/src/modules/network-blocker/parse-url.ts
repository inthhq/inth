/**
 * URL / method matching utilities.
 *
 * Pure functions: no globals beyond `window.location` (consulted only
 * by `parseUrl` for relative-URL resolution). Each helper takes plain
 * data and returns a boolean / `URL`.
 */

/**
 * Normalize an HTTP method to upper-case. `null`/`undefined`/empty
 * defaults to `'GET'`, matching the XHR / fetch spec defaults.
 */
export const normalizeMethod = function normalizeMethod(
	method: string | undefined | null
): string {
	if (!method) {
		return 'GET';
	}
	return method.toUpperCase();
};

/**
 * Best-effort URL parsing across the inputs `fetch` and XHR accept.
 *
 * Returns `null` (rather than throwing) when:
 * - input is `null`/`undefined`,
 * - input is a string and `window.location` isn't available to resolve
 *   a relative URL,
 * - the URL constructor throws (malformed inputs).
 *
 * Callers treat `null` as "let the request through" — we don't have
 * enough information to gate on it.
 */
export const parseUrl = function parseUrl(
	rawUrl: string | URL | Request
): URL | null {
	try {
		if (rawUrl instanceof URL) {
			return rawUrl;
		}
		if (typeof rawUrl === 'string') {
			if (typeof window === 'undefined') {
				return null;
			}
			return new URL(rawUrl, window.location?.href);
		}
		if (typeof Request !== 'undefined' && rawUrl instanceof Request) {
			return new URL(rawUrl.url);
		}
		return null;
	} catch {
		return null;
	}
};
