/**
 * The `/v1` routes of an Inth backend, and the request settings they share.
 *
 * The path is the version: a `/v1` request carries no version header and no
 * policy-contract header or query parameter. `/v1` routes set and read no
 * cookies.
 *
 * @internal
 */

/** Route paths below the project URL. */
export const V1_ROUTES = {
	acceptances: '/v1/documents/acceptances',
	init: '/v1/consent/init',
	manifest: '/v1/consent/manifest',
	records: '/v1/consent/records',
	sessions: '/v1/consent/sessions',
} as const;

/** `/v1/subjects/:id/link`. */
export const subjectLinkPath = function subjectLinkPath(
	subjectId: string
): string {
	return `/v1/subjects/${encodeURIComponent(subjectId)}/link`;
};

/** `/v1/documents/:type/current`. */
export const currentDocumentPath = function currentDocumentPath(
	type: string
): string {
	return `/v1/documents/${encodeURIComponent(type)}/current`;
};

/**
 * Credentials mode when the caller sets none. `/v1` routes use no cookies,
 * so a cross-origin request carries none and the backend can answer it with
 * `Access-Control-Allow-Origin: *`.
 */
export const V1_DEFAULT_CREDENTIALS: RequestCredentials = 'same-origin';

/** Headers of a `/v1` JSON request: content type and accept, nothing else. */
export const V1_JSON_HEADERS: Readonly<Record<string, string>> = {
	accept: 'application/json',
	'content-type': 'application/json',
};

/** Strip trailing slashes so `${base}/v1/...` doesn't double up. */
export const trimTrailingSlash = function trimTrailingSlash(
	url: string
): string {
	return url.replace(/\/+$/u, '');
};

/** Resolve the fetch implementation or throw when the runtime has none. */
export const resolveV1Fetch = function resolveV1Fetch(
	fetchImpl: typeof globalThis.fetch | undefined,
	caller: string
): typeof globalThis.fetch {
	const resolved = fetchImpl ?? globalThis.fetch?.bind(globalThis);
	if (!resolved) {
		throw new Error(
			`${caller}: no fetch available. Pass \`fetch\` in options.`
		);
	}
	return resolved;
};

/**
 * The property a consent belongs to: the explicit option, else the page's
 * host name, else the project URL's host name, else `localhost`. Always
 * lowercase, with no scheme, port or path.
 */
export const resolveProperty = function resolveProperty(
	projectUrl: string,
	explicit: string | undefined
): string {
	if (explicit) {
		return explicit.toLowerCase();
	}
	if (typeof window !== 'undefined' && window.location?.hostname) {
		return window.location.hostname.toLowerCase();
	}
	try {
		return new URL(projectUrl).hostname.toLowerCase();
	} catch {
		return 'localhost';
	}
};
