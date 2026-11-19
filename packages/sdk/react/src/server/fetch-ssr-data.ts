import { INTH_POLICY_CONTRACT_HEADER } from '@inth/sdk/engine';
import type { SSRInitialData } from '@inth/sdk/engine';
import { SPECULATION_HEADERS } from '@inth/sdk/schema/types';
import { fetchRequestInit, resolveRequestProjectUrl } from '@inth/sdk/server';

import type { FetchSSRDataOptions } from './types';

/** What the request told the backend, from the headers `/init` was sent. */
const buildRequestContext = function buildRequestContext(
	projectUrl: string,
	sent: Readonly<Record<string, string>>
): NonNullable<SSRInitialData['metadata']>['requestContext'] {
	return {
		country: sent['x-inth-country'] ?? null,
		gpc: sent['sec-gpc'] === '1',
		language: sent['accept-language'] ?? null,
		projectUrl,
		region: sent['x-inth-region'] ?? null,
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

	// A render with no request headers, such as a prerender, has no visitor
	// to ask the backend about.
	if (headers.keys().next().done) {
		if (debug) {
			console.log(
				'[@inth/react/server] The request has no headers, skipping SSR fetch'
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

	const startTime = getNowMs();
	const answer = await fetchRequestInit({
		adapter: '@inth/react',
		forwardHeaders: SPECULATION_HEADERS,
		// The provider's own init carries the journey; this request starts none.
		journey: false,
		onError: debug
			? (error) => {
					const message =
						error instanceof Error ? error.message : 'Unknown error';
					console.log(`[@inth/react/server] SSR fetch error: ${message}`);
				}
			: undefined,
		overrides,
		// A relative `projectUrl` is often this app's own proxy route.
		ownRoutes: [],
		projectUrl: normalizedUrl,
		request: { headers },
		sendConsentCookie: false,
		timeoutMs: false,
		trustForwardedHeaders: options.trustForwardedHeaders,
	});
	if (!answer) {
		if (debug) {
			console.log('[@inth/react/server] SSR fetch returned no data');
		}
		return undefined;
	}
	const metadata: SSRInitialData['metadata'] = {
		cache: inspectCacheHeaders(answer.responseHeaders),
		requestContext: buildRequestContext(normalizedUrl, answer.requestHeaders),
		requestDurationMs: Math.max(0, Math.round(getNowMs() - startTime)),
	};
	if (debug) {
		console.log(
			`[@inth/react/server] SSR fetch succeeded in ${metadata.requestDurationMs}ms, sending [${Object.keys(answer.requestHeaders).join(', ')}]`
		);
		if (metadata.cache?.detail) {
			console.log(
				`[@inth/react/server] SSR cache status: ${metadata.cache.detail}`
			);
		}
	}

	// The backend sends the GVL in the init response when it has one
	// configured.
	return {
		gvl: answer.init.gvl,
		init: answer.init,
		metadata,
		producerPolicyContract: answer.responseHeaders.get(
			INTH_POLICY_CONTRACT_HEADER
		),
	};
};
