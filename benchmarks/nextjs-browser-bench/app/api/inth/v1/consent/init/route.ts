import { createConsentRoute } from '@inth/nextjs/api';

const getBenchManifestUrl = function getBenchManifestUrl() {
	const token = process.env.INTH_BENCH_COLD_MANIFEST_TOKEN;
	return token
		? `/api/bench-consent/v1/consent/manifest?cold=${encodeURIComponent(token)}`
		: '/api/bench-consent/v1/consent/manifest';
};

// A fixed route file: the handler reads the route from the last URL segment.
export const { GET } = createConsentRoute({
	manifestUrl: getBenchManifestUrl(),
});
