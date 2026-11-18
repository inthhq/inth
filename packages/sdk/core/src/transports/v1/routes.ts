/**
 * The `/v1` routes of an Inth backend, and the request helpers their
 * clients share.
 *
 * @internal
 */

import { CONSENT_EXPERIMENT_HEADER } from '@inth/sdk-schema/types';

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

/**
 * `/v1` routes read `x-inth-<name>` request headers and ignore
 * `x-c15t-<name>`, while the shared header readers use the `x-c15t-` names.
 */
const V1_HEADER_PREFIX = 'x-inth-';
const SHARED_HEADER_PREFIX = 'x-c15t-';

const renamePrefix = function renamePrefix(
	name: string,
	from: string,
	to: string
): string {
	const lower = name.toLowerCase();
	return lower.startsWith(from) ? `${to}${lower.slice(from.length)}` : lower;
};

/** The name the shared header readers use for a request header. */
export const toSharedHeaderName = function toSharedHeaderName(
	name: string
): string {
	return renamePrefix(name, V1_HEADER_PREFIX, SHARED_HEADER_PREFIX);
};

/** A header record under the names a `/v1` route reads. */
export const toV1Headers = function toV1Headers(
	headers: Readonly<Record<string, string>>
): Record<string, string> {
	const renamed: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		renamed[renamePrefix(name, SHARED_HEADER_PREFIX, V1_HEADER_PREFIX)] = value;
	}
	return renamed;
};

export const V1_EXPERIMENT_HEADER = renamePrefix(
	CONSENT_EXPERIMENT_HEADER,
	SHARED_HEADER_PREFIX,
	V1_HEADER_PREFIX
);

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

/** A host name or app ID as a property: lowercase, with no trailing dot. */
export const toProperty = (host: string): string =>
	host.toLowerCase().replace(/\.+$/u, '');

/**
 * The property a consent belongs to: the explicit option, else the page's
 * host name, else the project URL's host name, else `localhost`.
 */
export const resolveProperty = function resolveProperty(
	projectUrl: string,
	explicit: string | undefined
): string {
	if (explicit) {
		return toProperty(explicit);
	}
	if (typeof window !== 'undefined' && window.location?.hostname) {
		return toProperty(window.location.hostname);
	}
	try {
		return toProperty(new URL(projectUrl).hostname);
	} catch {
		return 'localhost';
	}
};
