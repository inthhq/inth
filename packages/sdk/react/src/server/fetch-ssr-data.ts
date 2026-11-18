import { INTH_VERSION_HEADER } from '@inth/sdk/engine';
import type { InitOutput, SSRInitialData } from '@inth/sdk/engine';
import { resolveRequestProjectUrl } from '@inth/sdk/server';

import { version } from '../version';
import { CLIENT_FORWARDING_HEADERS, extractRelevantHeaders } from './headers';
import type { FetchSSRDataOptions } from './types';

interface SSRFetchResult {
	init?: InitOutput;
	metadata?: SSRInitialData['metadata'];
}

const buildRequestContext = function buildRequestContext(options: {
	projectUrl: string;
	headers: Record<string, string>;
	overrides?: FetchSSRDataOptions['overrides'];
}): NonNullable<SSRInitialData['metadata']>['requestContext'] {
	return {
		country:
			options.overrides?.country ?? options.headers['x-c15t-country'] ?? null,
		gpc: options.headers['sec-gpc'] === '1',
		language:
			options.overrides?.language ?? options.headers['accept-language'] ?? null,
		projectUrl: options.projectUrl,
		region:
			options.overrides?.region ?? options.headers['x-c15t-region'] ?? null,
	};
};

const getNowMs = function getNowMs(): number {
	if (
		typeof performance !== 'undefined' &&
		typeof performance.now === 'function'
	) {
		return performance.now();
	}
	return Date.now();
};

const inspectCacheHeaders = function inspectCacheHeaders(headers: Headers): {
	isHit: boolean;
	detail: string | null;
} {
	const cacheHeaders = [
		'x-vercel-cache',
		'cf-cache-status',
		'x-cache',
		'cache-status',
	] as const;

	let headerDetail: string | null = null;
	let headerIndicatesHit = false;

	for (const headerName of cacheHeaders) {
		const headerValue = headers.get(headerName);
		if (!headerValue) {
			continue;
		}

		headerDetail = `${headerName}=${headerValue}`;
		headerIndicatesHit = /\b(?:hit|stale|revalidated|updating)\b/iu.test(
			headerValue
		);
		break;
	}

	const ageHeader = headers.get('age');
	const ageValue = ageHeader ? Number.parseInt(ageHeader, 10) : Number.NaN;
	const ageIndicatesCache = Number.isFinite(ageValue) && ageValue > 0;
	const ageDetail = ageIndicatesCache ? `age=${ageValue}` : null;
	const detail =
		headerDetail && ageDetail
			? `${headerDetail}, ${ageDetail}`
			: (headerDetail ?? ageDetail);

	return {
		detail,
		isHit: headerIndicatesHit || ageIndicatesCache,
	};
};

const logRelevantHeaders = function logRelevantHeaders(
	relevantHeaders: Record<string, string>,
	debug?: boolean
): void {
	if (!debug) {
		return;
	}
	const headerKeys = Object.keys(relevantHeaders);
	console.log(
		`[@inth/react/server] Detected headers: [${headerKeys.join(', ')}]`
	);
	const cfCountry = relevantHeaders['cf-ipcountry'];
	const xCountry = relevantHeaders['x-vercel-ip-country'];
	if (cfCountry) {
		console.log(`[@inth/react/server] Country from cf-ipcountry: ${cfCountry}`);
	} else if (xCountry) {
		console.log(
			`[@inth/react/server] Country from x-vercel-ip-country: ${xCountry}`
		);
	}
};

const performInitFetch = async function performInitFetch(
	normalizedUrl: string,
	relevantHeaders: Record<string, string>,
	requestContext: NonNullable<SSRInitialData['metadata']>['requestContext'],
	debug?: boolean
): Promise<SSRFetchResult> {
	const startTime = getNowMs();

	try {
		const response = await fetch(`${normalizedUrl}/init`, {
			cache: 'no-store',
			headers: relevantHeaders,
			method: 'GET',
		});
		const requestDurationMs = Math.max(0, Math.round(getNowMs() - startTime));
		const cache = inspectCacheHeaders(response.headers);
		const metadata: SSRInitialData['metadata'] = {
			cache,
			requestContext,
			requestDurationMs,
		};

		if (response.ok) {
			const init = await response.json();
			const result: SSRFetchResult = {
				init: init as InitOutput,
				metadata,
			};
			if (debug) {
				console.log(
					`[@inth/react/server] SSR fetch succeeded in ${result.metadata?.requestDurationMs ?? 0}ms`
				);
				if (result.metadata?.cache?.detail) {
					console.log(
						`[@inth/react/server] SSR cache status: ${result.metadata.cache.detail}`
					);
				}
			}
			return result;
		}
		if (debug) {
			console.log(
				`[@inth/react/server] SSR fetch failed with status: ${response.status}`
			);
			if (cache.detail) {
				console.log(`[@inth/react/server] SSR cache status: ${cache.detail}`);
			}
		}
		return { metadata };
	} catch (error) {
		if (debug) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.log(`[@inth/react/server] SSR fetch error: ${message}`);
		}
		return {};
	}
};

/**
 * Fetches initial consent data on the server for SSR hydration.
 *
 * @remarks
 * This is the framework-agnostic SSR data fetching function. It accepts
 * a standard Web API Headers object and performs the fetch to the Inth backend.
 *
 * Framework-specific packages (like @inth/nextjs) wrap this function
 * with their own header resolution logic.
 *
 * **Usage in Framework Wrappers:**
 * ```ts
 * // @inth/nextjs
 * import { headers } from 'next/headers';
 * import { fetchSSRData } from '@inth/react/server';
 *
 * export async function fetchInitialData(options) {
 *   const nextHeaders = await headers();
 *   return fetchSSRData({ ...options, headers: nextHeaders });
 * }
 * ```
 *
 * **Direct Usage (advanced):**
 * ```ts
 * // In any framework with access to request headers
 * import { fetchSSRData } from '@inth/react/server';
 *
 * const data = await fetchSSRData({
 *   projectUrl: '/api/consent',
 *   headers: request.headers,
 *   debug: true
 * });
 * ```
 *
 * @returns The SSR initial data or undefined if the fetch fails
 *
 * @public
 */
export const fetchSSRData = async function fetchSSRData(
	options: FetchSSRDataOptions
): Promise<SSRInitialData | undefined> {
	const { projectUrl, headers, overrides, debug } = options;

	if (debug) {
		console.log('[@inth/react/server] SSR fetch starting...');
	}

	const relevantHeaders = extractRelevantHeaders(headers, {
		trustForwardedHeaders: options.trustForwardedHeaders,
	});

	logRelevantHeaders(relevantHeaders, debug);

	// We can't fetch from the server if the headers are not present. Untrusted
	// forwarding headers are not sent, but they still mark a live request.
	const hasRequestHeaders =
		Object.keys(relevantHeaders).length > 0 ||
		CLIENT_FORWARDING_HEADERS.some((name) => headers.has(name));
	if (!hasRequestHeaders) {
		if (debug) {
			console.log(
				'[@inth/react/server] No relevant headers found, skipping SSR fetch'
			);
		}
		return undefined;
	}

	const normalizedUrl = resolveRequestProjectUrl(projectUrl, {
		headers,
		trustForwardedHeaders: options.trustForwardedHeaders,
	});
	if (!normalizedUrl) {
		if (debug) {
			console.log(
				'[@inth/react/server] Failed to normalize URL, skipping SSR fetch'
			);
		}
		return undefined;
	}

	if (debug) {
		console.log(`[@inth/react/server] Fetching from: ${normalizedUrl}/init`);
	}

	// Preserve an incoming client version; direct SSR requests use this
	// package's version so the backend can attribute them to a release.
	const initHeaders = { [INTH_VERSION_HEADER]: version, ...relevantHeaders };
	if (overrides?.country) {
		initHeaders['x-c15t-country'] = overrides.country;
		if (debug) {
			console.log(
				`[@inth/react/server] Country override: ${overrides.country}`
			);
		}
	}
	if (overrides?.region) {
		initHeaders['x-c15t-region'] = overrides.region;
		if (debug) {
			console.log(`[@inth/react/server] Region override: ${overrides.region}`);
		}
	}
	if (overrides?.language) {
		initHeaders['accept-language'] = overrides.language;
		if (debug) {
			console.log(
				`[@inth/react/server] Language override: ${overrides.language}`
			);
		}
	}

	const initResult = await performInitFetch(
		normalizedUrl,
		initHeaders,
		buildRequestContext({
			headers: initHeaders,
			overrides,
			projectUrl: normalizedUrl,
		}),
		debug
	);
	const { init } = initResult;

	if (!init) {
		if (debug) {
			console.log('[@inth/react/server] SSR fetch returned no data');
		}
		return undefined;
	}

	// The backend sends the GVL in the init response when it has one
	// configured.
	return { gvl: init.gvl, init, metadata: initResult.metadata };
};
