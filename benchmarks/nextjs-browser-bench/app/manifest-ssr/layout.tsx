import { resolveConsent } from '@inth/nextjs/server';
import type { ReactNode } from 'react';

import { NextjsManifestBenchmarkProvider } from '../_bench/provider';

/**
 * The fixture manifest the `/api/inth` routes read, cold token included.
 * The render reads the same source through the shared in-process cache: a
 * server render never fetches the app's own consent routes.
 */
const getBenchManifestUrl = function getBenchManifestUrl() {
	const token = process.env.INTH_BENCH_COLD_MANIFEST_TOKEN;
	return token
		? `/api/bench-consent/v1/consent/manifest?cold=${encodeURIComponent(token)}`
		: '/api/bench-consent/v1/consent/manifest';
};

const ManifestSSRLayout = async ({ children }: { children: ReactNode }) => {
	const state = await resolveConsent({
		manifestUrl: getBenchManifestUrl(),
		projectUrl: '/api/bench-consent',
	});

	return (
		<NextjsManifestBenchmarkProvider
			state={state}
			scenario="manifest-ssr"
		>
			{children}
		</NextjsManifestBenchmarkProvider>
	);
};

export default ManifestSSRLayout;
