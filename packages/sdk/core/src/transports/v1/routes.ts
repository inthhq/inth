/**
 * The `/v1` routes of an Inth backend, and the request helpers their
 * clients share.
 *
 * @internal
 */

/** Route paths below the project URL. */
export const V1_ROUTES = {
	init: '/v1/consent/init',
	manifest: '/v1/consent/manifest',
	records: '/v1/consent/records',
	sessions: '/v1/consent/sessions',
	subjectLink: '/v1/subjects/:id/link',
} as const;

export const subjectLinkPath = function subjectLinkPath(
	subjectId: string
): string {
	return V1_ROUTES.subjectLink.replace(':id', encodeURIComponent(subjectId));
};

export const V1_JSON_HEADERS: Readonly<Record<string, string>> = {
	accept: 'application/json',
	'content-type': 'application/json',
};

export const trimTrailingSlash = function trimTrailingSlash(
	url: string
): string {
	return url.replace(/\/+$/u, '');
};

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
 * host name, else the project URL's host name, else `localhost`.
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
