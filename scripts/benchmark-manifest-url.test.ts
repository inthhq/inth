import { afterEach, expect, test, vi } from 'vite-plus/test';

import { getBenchManifestUrl } from '../benchmarks/tanstack-start-browser-bench/src/bench/manifest-url';

afterEach(() => vi.unstubAllEnvs());

test.each([
	'https://manifest.test/list?tenant=one#section',
	'/api/list?tenant=one#section',
])('preserves existing query parameters in %s', (base) => {
	vi.stubEnv('INTH_BENCH_MANIFEST_URL', base);
	vi.stubEnv('INTH_BENCH_COLD_MANIFEST_TOKEN', 'cold token');
	const result = new URL(getBenchManifestUrl(), 'https://app.test');
	expect(result.searchParams.get('tenant')).toBe('one');
	expect(result.searchParams.get('cold')).toBe('cold token');
	expect(result.hash).toBe('#section');
});
