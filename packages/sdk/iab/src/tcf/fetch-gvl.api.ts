/**
 * Fetches the IAB TCF Global Vendor List. Caching is left to the endpoint's
 * HTTP Cache-Control headers.
 *
 * @packageDocumentation
 */

import type { GlobalVendorList } from '@inth/sdk-core';
import { DEFAULT_GVL_ENDPOINT } from '@inth/sdk-schema/types';

/**
 * The most vendor ids ever put in the GVL request query string.
 *
 * The endpoint filters server-side, which is what keeps a scoped publisher from
 * downloading all 1,200-odd vendors, but the filter travels as a query string:
 * two hundred ids is already a 700-byte query, and a publisher that scopes a
 * few thousand pushes the request past the request-line limit a CDN enforces,
 * which fails the whole consent surface rather than just the filter. Above the
 * cap the endpoint returns the full list and callers narrow it locally, which
 * costs bytes instead of breaking.
 *
 * @internal
 */
const MAX_GVL_QUERY_VENDOR_IDS = 500;

/** In-flight requests keyed by request parameters, shared by concurrent callers. */
const inflightRequests = new Map<string, Promise<GlobalVendorList | null>>();

let mockGVLData: GlobalVendorList | null | undefined = undefined;

/**
 * Fetches the Global Vendor List from the GVL endpoint (default
 * `https://gvl.inth.app`).
 *
 * `vendorIds` filters the response server-side. Concurrent calls with the
 * same parameters share one request. Resolves to `null` when the endpoint
 * answers 204, which means IAB does not apply in the visitor's region.
 *
 * @example
 * ```typescript
 * const gvl = await fetchGVL([1, 2, 10, 755]);
 * if (gvl === null) {
 *   // Non-IAB region.
 * }
 * ```
 *
 * @public
 */
export const fetchGVL = function fetchGVL(
	vendorIds?: number[],
	options: { endpoint?: string; headers?: HeadersInit; format?: 'init' } = {}
): Promise<GlobalVendorList | null> {
	// Browser-mode tests set the mock on window.
	const windowMockGVL =
		typeof window === 'undefined'
			? undefined
			: (window as unknown as { __inth_mock_gvl?: GlobalVendorList | null })
					.__inth_mock_gvl;

	if (windowMockGVL !== undefined) {
		return Promise.resolve(windowMockGVL);
	}

	if (mockGVLData !== undefined) {
		return Promise.resolve(mockGVLData);
	}

	const { endpoint = DEFAULT_GVL_ENDPOINT, headers } = options;

	const sortedVendorIds = vendorIds ? [...vendorIds].sort((a, b) => a - b) : [];
	const headersKey = headers ? JSON.stringify(headers) : '';
	const cacheKey = `${endpoint}|${sortedVendorIds.join(',')}|${headersKey}|${options.format ?? 'gvl'}`;

	const existingRequest = inflightRequests.get(cacheKey);
	if (existingRequest) {
		return existingRequest;
	}

	const url = new URL(
		endpoint,
		typeof window === 'undefined' ? undefined : window.location.href
	);
	if (
		sortedVendorIds.length > 0 &&
		sortedVendorIds.length <= MAX_GVL_QUERY_VENDOR_IDS
	) {
		url.searchParams.set('vendorIds', sortedVendorIds.join(','));
	}

	const promise = (async () => {
		try {
			const response = await fetch(url.toString(), {
				headers,
			});

			// 204 means a non-IAB region.
			if (response.status === 204) {
				return null;
			}

			if (!response.ok) {
				throw new Error(
					`Failed to fetch GVL: ${response.status} ${response.statusText}`
				);
			}

			let payload: unknown = await response.json();
			if (options.format === 'init') {
				payload =
					payload && typeof payload === 'object' && 'gvl' in payload
						? payload.gvl
						: null;
			}
			const gvl = payload as GlobalVendorList;
			if (!gvl) {
				return null;
			}

			// tcfPolicyVersion belongs
			// in this list even though no caller reads it: the TC String derives its
			// TcfPolicyVersion from the vendor list rather than from config, so a
			// list carrying no usable version would encode a string that a reader
			// cannot grade against the policy it was collected under.
			if (
				!gvl.vendorListVersion ||
				!gvl.purposes ||
				!gvl.vendors ||
				!Number.isSafeInteger(gvl.tcfPolicyVersion) ||
				gvl.tcfPolicyVersion < 1
			) {
				throw new Error('Invalid GVL response: missing required fields');
			}

			return gvl;
		} finally {
			inflightRequests.delete(cacheKey);
		}
	})();

	inflightRequests.set(cacheKey, promise);

	return promise;
};

/**
 * Clears the in-flight requests and the mock GVL. Meant for tests.
 *
 * @public
 */
export const clearGVLCache = function clearGVLCache(): void {
	inflightRequests.clear();
	mockGVLData = undefined;
};

/**
 * Makes `fetchGVL` return `gvl` without a request, for tests. `null` acts as
 * a 204 response; `undefined` clears the mock.
 *
 * @internal
 */
export const setMockGVL = function setMockGVL(
	gvl: GlobalVendorList | null | undefined
): void {
	mockGVLData = gvl;
};
