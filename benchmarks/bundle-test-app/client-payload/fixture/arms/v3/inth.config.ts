import { defineConsentConfig, manifest } from '@inth/nextjs';

/**
 * The App Router guide's shared config, pointed at the local mock backend.
 * The shared `next.config.mjs` has no `withConsentManifest`, so the layout
 * and the client wrapper pass this config explicitly.
 */
export default defineConsentConfig({
	// The browser resolves from `/mock-backend/v1/consent/manifest` when it re-inits.
	mode: manifest({ resolve: 'browser' }),
	projectUrl: '/mock-backend',
});
