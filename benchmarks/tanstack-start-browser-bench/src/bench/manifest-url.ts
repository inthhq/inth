/**
 * Server-only. The runner sets `INTH_BENCH_COLD_MANIFEST_TOKEN` in
 * `--cold-manifest` mode so every run starts with a fresh manifest cache
 * key, the same way the Next arm's `app/api/inth/*` routes do.
 */
export const BENCH_BACKEND_URL = '/api/bench-consent';

export const getBenchManifestUrl = function getBenchManifestUrl(): string {
	const token = (globalThis as { process?: { env?: Record<string, string> } })
		.process?.env?.INTH_BENCH_COLD_MANIFEST_TOKEN;
	const base =
		process.env.INTH_BENCH_MANIFEST_URL ?? `${BENCH_BACKEND_URL}/v1/consent/manifest`;
	if (!token) {
		return base;
	}
	const url = new URL(base, 'http://inth-benchmark.local');
	url.searchParams.set('cold', token);
	return base.startsWith('/')
		? `${url.pathname}${url.search}${url.hash}`
		: url.href;
};
