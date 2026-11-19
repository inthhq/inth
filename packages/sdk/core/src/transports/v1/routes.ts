/**
 * The `/v1` routes of an Inth backend, and the request helpers their
 * clients share.
 *
 * @internal
 */

import {
	V1_PROPERTY_MAX_LENGTH,
	V1_PROPERTY_PATTERN,
	V1_UUID_V7_PATTERN,
} from '@inth/sdk-schema/types';

/**
 * Whether `id` has the layout of a `/v1` subject ID. The timestamp is not
 * judged.
 *
 * @param id - The string to check.
 * @returns `true` for a lowercase UUIDv7.
 */
export const isUuidV7 = function isUuidV7(id: string): boolean {
	return V1_UUID_V7_PATTERN.test(id);
};

/** Route paths below the project URL. */
export const V1_ROUTES = {
	acceptances: '/v1/documents/acceptances',
	currentDocument: '/v1/documents/:type/current',
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

export const currentDocumentPath = function currentDocumentPath(
	type: string
): string {
	return V1_ROUTES.currentDocument.replace(':type', encodeURIComponent(type));
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

export const readJson = async function readJson(
	response: Response
): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
};

/**
 * A host name or app ID as a property: lowercase, less one trailing dot.
 * `undefined` when the result is not a property the backend accepts, such
 * as a URL or an IPv6 address.
 */
export const toProperty = (host: string): string | undefined => {
	const property = host.toLowerCase().replace(/\.$/u, '');
	return property.length <= V1_PROPERTY_MAX_LENGTH &&
		V1_PROPERTY_PATTERN.test(property)
		? property
		: undefined;
};

/**
 * The property a consent belongs to: the explicit option, else the page's
 * host name, else the project URL's host name, else `localhost`. A page
 * host name that is not a property, such as an IPv6 address, is `localhost`.
 *
 * @throws {TypeError} When the explicit option is not a host name or app ID.
 */
export const resolveProperty = function resolveProperty(
	projectUrl: string,
	explicit: string | undefined
): string {
	if (explicit) {
		const property = toProperty(explicit);
		if (property === undefined) {
			throw new TypeError(
				`Inth transport: property "${explicit}" is not a host name or app ID.`
			);
		}
		return property;
	}
	const hostname =
		typeof window === 'undefined' ? undefined : window.location?.hostname;
	if (hostname) {
		return toProperty(hostname) ?? 'localhost';
	}
	try {
		return toProperty(new URL(projectUrl).hostname) ?? 'localhost';
	} catch {
		return 'localhost';
	}
};
