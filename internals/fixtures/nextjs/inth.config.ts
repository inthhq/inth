import { defineConsentConfig, manifest } from '@inth/nextjs';

import { testBackend } from './lib/test-backend';

/**
 * No `withConsentManifest` in `next.config.ts`: the server reads the
 * manifest at runtime through its cache, so the files that need this config
 * import it.
 */
export default defineConsentConfig({
	projectUrl: 'https://your-project.inth.app',
	...testBackend('projectUrl'),
	// Pages that pass no state resolve consent in the browser from the
	// manifest route, `app/api/inth/manifest/route.ts`.
	mode: manifest({ resolve: 'browser' }),
	routePrefix: '/api/inth',
});
