import {
	appendInitParams,
	appendJourneyParams,
	applyInitParamsToHeaders,
} from '@inth/sdk-schema/types';

import {
	buildRequestContextHeaders,
	buildRequestContextParams,
	buildRequestContextSentHeaders,
} from '../../libs/request-context-headers';
import type { InitContext } from '../../types';
import { trimTrailingSlash, V1_ROUTES } from './routes';

export interface V1InitRequest {
	url: string;
	/** The request inputs in header form, which the response is read against. */
	requestHeaders: Record<string, string>;
	init: RequestInit & { headers: Record<string, string> };
}

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
	const base =
		options.initUrl ??
		`${trimTrailingSlash(options.projectUrl)}${V1_ROUTES.init}`;
	const params = appendInitParams(base, {
		...buildRequestContextParams(options.overrides),
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
			credentials: options.credentials,
			// No custom headers: init must stay a CORS simple request, or a
			// browser sends a preflight before the banner can show. The
			// overrides go in the query; Accept-Language is safelisted.
			headers: {
				accept: 'application/json',
				...options.headers,
				...buildRequestContextSentHeaders(options.overrides),
			},
			method: 'GET',
		},
		requestHeaders,
		url,
	};
};
