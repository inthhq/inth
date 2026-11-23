import {
	appendInitParams,
	appendJourneyParams,
	applyInitParamsToHeaders,
	extractConsentRequestInputs,
} from '@inth/sdk-schema/types';

import type { InitContext } from '../../consent-kernel.model';
import {
	browserInitCredentials,
	buildRequestContextHeaders,
	buildRequestContextParams,
	buildRequestContextSentHeaders,
	DEFAULT_INIT_CREDENTIALS,
} from '../../libs/request-context-headers.model';
import { trimTrailingSlash, V1_ROUTES } from './v1-routes';

export interface V1InitRequest {
	url: string;
	/** The request inputs in header form, which the response is read against. */
	requestHeaders: Record<string, string>;
	init: RequestInit & { headers: Record<string, string> };
}

const definedEntries = function definedEntries<Value extends object>(
	value: Value | undefined
): Partial<Value> {
	return Object.fromEntries(
		Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)
	) as Partial<Value>;
};

/**
 * Build the `GET /v1/consent/init` request.
 *
 * @param options - Project URL, optional `initUrl`, credentials, the
 *   caller headers already filtered to the init inputs, the overrides, and
 *   the experiment arm and journey the request carries.
 * @returns The URL, the inputs as headers and the fetch options.
 */
export const createV1InitRequest = function createV1InitRequest(options: {
	projectUrl: string;
	initUrl?: string;
	credentials?: RequestCredentials;
	headers?: Record<string, string>;
	overrides: InitContext['overrides'];
	experiment?: InitContext['experiment'];
	journey?: InitContext['journey'];
}): V1InitRequest {
	const inBrowser = typeof document !== 'undefined';
	// A browser's init is a plain GET, so no custom header leaves it: the
	// caller's geo and GPC headers travel as overrides, in the query, and its
	// Accept-Language, which is safelisted, goes as it is, weights and all.
	const { language: _primary, ...headerInputs } = inBrowser
		? extractConsentRequestInputs(options.headers ?? {})
		: {};
	const overrides = inBrowser
		? { ...headerInputs, ...definedEntries(options.overrides) }
		: options.overrides;
	const acceptLanguage = inBrowser
		? new Headers(options.headers).get('accept-language')
		: null;
	const base =
		options.initUrl ??
		`${trimTrailingSlash(options.projectUrl)}${V1_ROUTES.init}`;
	const params = appendInitParams(base, {
		...buildRequestContextParams(overrides),
		experiment: options.experiment,
	});
	const url = options.journey
		? appendJourneyParams(params, {
				id: options.journey.id,
				scope: options.journey.scope,
				storedChoice: options.journey.storedChoice,
			})
		: params;
	const requestHeaders = Object.fromEntries(
		applyInitParamsToHeaders(
			url,
			new Headers({
				...options.headers,
				...buildRequestContextHeaders(options.overrides),
			})
		)
	);
	return {
		init: {
			credentials: inBrowser
				? browserInitCredentials(options.credentials)
				: (options.credentials ?? DEFAULT_INIT_CREDENTIALS),
			headers: {
				accept: 'application/json',
				...(!inBrowser && options.headers),
				...(acceptLanguage && { 'accept-language': acceptLanguage }),
				...buildRequestContextSentHeaders(overrides),
			},
			method: 'GET',
		},
		requestHeaders,
		url,
	};
};
