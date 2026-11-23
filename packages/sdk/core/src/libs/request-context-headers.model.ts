import type { InitRequestParams } from '@inth/sdk-schema/types';

import type { Overrides } from '../options/overrides-options.model';

/**
 * Credentials mode for `GET /v1/consent/init` when the caller sets none.
 *
 * Init reads no cookie and sets none. With `same-origin` a browser sends
 * no cookie to a cross-origin backend, so its init stays a plain GET the
 * backend answers with `Access-Control-Allow-Origin: *`. An app's own
 * same-origin consent route still gets the app's cookies, for an app that
 * puts that route behind its session.
 */
export const DEFAULT_INIT_CREDENTIALS: RequestCredentials = 'same-origin';

/**
 * The credentials mode of a browser's init: `omit` when asked, else
 * {@link DEFAULT_INIT_CREDENTIALS}. Never `include`: a cross-origin backend
 * that answers `Access-Control-Allow-Origin: *` refuses a request that
 * carries cookies.
 *
 * @param credentials - The mode the caller asked for.
 * @returns The mode to send.
 */
export const browserInitCredentials = function browserInitCredentials(
	credentials: RequestCredentials | undefined
): RequestCredentials {
	return credentials === 'omit' ? 'omit' : DEFAULT_INIT_CREDENTIALS;
};

/**
 * The caller's init overrides in their request-header form.
 *
 * A browser's `GET /v1/consent/init` does not send most of these: country, region and
 * GPC travel as query parameters ({@link buildRequestContextParams}) so the
 * request needs no CORS preflight. This record is what the response is read
 * against (the GPC override, prefetch matching) and what server-side
 * callers forward.
 *
 * In its own module so code that only builds the init request does not pull
 * in the rest of `request-context` (URL canonicalization, prefetch
 * matching, GPC detection).
 */
export const buildRequestContextHeaders = function buildRequestContextHeaders(
	overrides?: Pick<Overrides, 'country' | 'region' | 'language' | 'gpc'>
): Record<string, string> {
	const headers: Record<string, string> = {};

	if (overrides?.gpc !== undefined) {
		// `Sec-*` request headers are forbidden to scripts, so the override
		// travels on the adapter header the shared extractor reads first.
		headers['x-inth-gpc'] = overrides.gpc ? '1' : '0';
	}

	if (overrides?.country) {
		headers['x-inth-country'] = overrides.country;
	}

	if (overrides?.region) {
		headers['x-inth-region'] = overrides.region;
	}

	if (overrides?.language) {
		headers['accept-language'] = overrides.language;
	}

	return headers;
};

/**
 * The init overrides a browser's `GET /v1/consent/init` sends as query parameters:
 * country, region and GPC. Language stays on `Accept-Language`, which is
 * CORS-safelisted (see {@link buildRequestContextSentHeaders}).
 *
 * @returns The parameters for `appendInitParams`.
 */
export const buildRequestContextParams = function buildRequestContextParams(
	overrides?: Pick<Overrides, 'country' | 'region' | 'gpc'>
): Pick<InitRequestParams, 'country' | 'region' | 'gpc'> {
	return {
		...(overrides?.country && { country: overrides.country }),
		...(overrides?.region && { region: overrides.region }),
		...(overrides?.gpc !== undefined && { gpc: overrides.gpc }),
	};
};

/**
 * The override headers a browser's `GET /v1/consent/init` actually sends: only
 * `Accept-Language`, which is CORS-safelisted and which every backend
 * already reads.
 *
 * @returns Header record to spread into the init request.
 */
export const buildRequestContextSentHeaders =
	function buildRequestContextSentHeaders(
		overrides?: Pick<Overrides, 'language'>
	): Record<string, string> {
		return overrides?.language ? { 'accept-language': overrides.language } : {};
	};
