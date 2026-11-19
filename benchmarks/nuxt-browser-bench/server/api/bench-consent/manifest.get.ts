import {
	applyBenchConsentLatency,
	benchConsentManifestResponse,
	recordBenchConsentFixtureExecution,
	recordBenchConsentVersionHeader,
} from './fixture';

export default defineEventHandler(async (event) => {
	recordBenchConsentFixtureExecution('manifest');
	recordBenchConsentVersionHeader(
		'manifest',
		getRequestHeader(event, 'x-inth-version')
	);
	await applyBenchConsentLatency();

	setHeader(
		event,
		'cache-control',
		'public, s-maxage=300, stale-while-revalidate=86400'
	);
	setHeader(event, 'etag', '"nuxt-browser-bench-manifest"');
	return benchConsentManifestResponse;
});
