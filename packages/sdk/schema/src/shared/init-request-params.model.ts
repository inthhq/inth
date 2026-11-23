/**
 * Query parameters that carry the `GET /v1/consent/init` request inputs.
 *
 * A browser on another origin can send init as a CORS simple request, with
 * no `OPTIONS` preflight, only while every request header is
 * CORS-safelisted. So the init overrides and the experiment arm travel in
 * the query string, next to the journey parameters, not on `x-inth-*`
 * headers.
 *
 * Each parameter has the same value and meaning as one `x-inth-*` request
 * header, which a server caller may still send.
 * {@link applyInitParamsToHeaders} folds the parameters onto their header
 * names, so the code that reads those headers needs no second path.
 *
 * The names are short and unprefixed (`?country=GB&gpc=1`), so Inth
 * reserves them on an init URL. When Inth sends a parameter, its value
 * replaces any the URL already carried under that name, and the name
 * appears once. A parameter Inth does not send passes through, and a
 * backend reads it as that input.
 */

import { appendSearchParams, readSearchParams } from './search-params.model';
import {
	CONSENT_EXPERIMENT_HEADER,
	formatExperimentHeader,
} from './session-report.model';
import type { SessionExperiment } from './session-report.model';

/** Country override, an ISO 3166-1 alpha-2 code (`x-inth-country`). */
export const INIT_COUNTRY_PARAM = 'country';

/** Region override, an ISO 3166-2 subdivision code (`x-inth-region`). */
export const INIT_REGION_PARAM = 'region';

/** GPC override, `1` or `0` (`x-inth-gpc`). Any other value is ignored. */
export const INIT_GPC_PARAM = 'gpc';

/**
 * Banner-experiment arm as `<id>=<arm>`, both parts URI-encoded
 * (`x-inth-experiment`). Sent only while the visitor has no stored choice.
 */
export const INIT_EXPERIMENT_PARAM = 'experiment';

/** Each init query parameter and the header with the same meaning. */
export const INIT_PARAM_HEADERS: readonly (readonly [string, string])[] = [
	[INIT_COUNTRY_PARAM, 'x-inth-country'],
	[INIT_REGION_PARAM, 'x-inth-region'],
	[INIT_GPC_PARAM, 'x-inth-gpc'],
	[INIT_EXPERIMENT_PARAM, CONSENT_EXPERIMENT_HEADER],
];

/** The init inputs that travel in the query string. */
export interface InitRequestParams {
	/** Country override. */
	country?: string;
	/** Region override. */
	region?: string;
	/** GPC override. */
	gpc?: boolean;
	/** Experiment arm, while the visitor has no stored choice. */
	experiment?: SessionExperiment;
}

/**
 * Append the init inputs to an init URL.
 *
 * Parameters are written in a fixed order, so two callers with the same
 * inputs build the same URL and a cache keyed on it sees one entry.
 *
 * @param url - The init URL, absolute or relative, or `''` for just the query.
 * @param params - The inputs. Absent fields are left out.
 */
export const appendInitParams = function appendInitParams(
	url: string,
	params: InitRequestParams
): string {
	const search = new URLSearchParams();
	if (params.country) {
		search.set(INIT_COUNTRY_PARAM, params.country);
	}
	if (params.region) {
		search.set(INIT_REGION_PARAM, params.region);
	}
	if (params.gpc !== undefined) {
		search.set(INIT_GPC_PARAM, params.gpc ? '1' : '0');
	}
	if (params.experiment) {
		search.set(
			INIT_EXPERIMENT_PARAM,
			formatExperimentHeader(params.experiment)
		);
	}
	return appendSearchParams(url, search);
};

/**
 * The request headers with the init query parameters folded onto the
 * header names of the same meaning.
 *
 * A parameter wins over a header with the same meaning: a client that sends
 * the parameter is newer than any header a proxy might add. An empty
 * parameter is ignored, and so is a `gpc` other than `1` or `0`, so a
 * malformed value never hides a browser's `Sec-GPC`.
 *
 * @param url - The request URL, absolute or relative.
 * @param headers - The request headers. Left unchanged.
 * @returns A copy of the headers with the parameters applied.
 */
export const applyInitParamsToHeaders = function applyInitParamsToHeaders(
	url: string | URL,
	headers: Headers
): Headers {
	const params = readSearchParams(url);
	const merged = new Headers(headers);
	for (const [param, header] of INIT_PARAM_HEADERS) {
		const value = params.get(param);
		if (!value) {
			continue;
		}
		if (param === INIT_GPC_PARAM && value !== '1' && value !== '0') {
			continue;
		}
		merged.set(header, value);
	}
	return merged;
};
