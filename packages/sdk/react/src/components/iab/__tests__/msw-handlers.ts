import { HttpResponse, http } from 'msw';

import { mockGVL } from './fixtures/mock-consent-state';

export const handlers = [
	// Mock GVL endpoint - use wildcard pattern to match with or without trailing slash and query params
	http.get('https://gvl.inth.app*', ({ request }) => {
		console.log('[MSW] GVL request intercepted:', request.url);
		const url = new URL(request.url);
		const vendorIds = url.searchParams.get('vendorIds');

		if (vendorIds) {
			const ids = vendorIds.split(',').map(Number);
			const filteredVendors: typeof mockGVL.vendors = {};
			for (const id of ids) {
				if (mockGVL.vendors[id]) {
					filteredVendors[id] = mockGVL.vendors[id];
				}
			}
			return HttpResponse.json({
				...mockGVL,
				vendors: filteredVendors,
			});
		}

		return HttpResponse.json(mockGVL);
	}),
];

/**
 * Handler that returns 204 (non-IAB region)
 */
export const nonIABRegionHandler = http.get('https://gvl.inth.app*', () => {
	console.log('[MSW] Returning 204 (non-IAB region)');
	return new HttpResponse(null, { status: 204 });
});

export const errorHandler = http.get('https://gvl.inth.app*', () => {
	console.log('[MSW] Returning error');
	return HttpResponse.error();
});

export const invalidGVLHandler = http.get('https://gvl.inth.app*', () => {
	console.log('[MSW] Returning invalid GVL');
	return HttpResponse.json({ invalid: 'data' });
});
