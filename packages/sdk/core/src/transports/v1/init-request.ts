/**
 * The `GET /v1/consent/init` request.
 *
 * A CORS simple request: a `GET` whose only headers are `Accept` and, with
 * a language override, `Accept-Language`. Country, region and GPC
 * overrides, the experiment arm and the journey travel in the query string,
 * so a cross-origin backend answers without an `OPTIONS` preflight. There is
 * no version or policy-contract parameter: the path is the version.
 */
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
import { trimTrailingSlash, V1_DEFAULT_CREDENTIALS, V1_ROUTES } from './routes';

/** The init request a `/v1` transport sends. */
export interface V1InitRequest {
	/** `initUrl`, or `${projectUrl}/v1/consent/init`, with the query. */
	url: string;
	/**
	 * The request inputs in header form: the caller headers plus the
	 * overrides. The response is read against these.
	 */
	requestHeaders: Record<string, string>;
	/** Fetch options for the request. */
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
			credentials: options.credentials ?? V1_DEFAULT_CREDENTIALS,
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
