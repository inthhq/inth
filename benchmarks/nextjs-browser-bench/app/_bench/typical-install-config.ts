import { defineConsentConfig, manifest } from '@inth/nextjs';

/**
 * The `typical-install` arm's consent config, shaped like the Next.js
 * quickstart's `inth.config.ts`: a hosted backend plus the app's cached
 * manifest route. The backend is the bench fixture, which sleeps for
 * `INTH_BENCH_BACKEND_LATENCY_MS` on every request.
 */
export const typicalInstallConfig = defineConsentConfig({
	// The server reads the backend's manifest; a browser re-init resolves
	// from the app's cached manifest route.
	mode: manifest({
		manifestUrl: '/api/inth/v1/consent/manifest',
		resolve: 'browser',
	}),
	projectUrl: '/api/bench-consent',
});

/** Where the stand-in vendor scripts are served from (`public/`). */
export const benchVendorScripts = {
	gtag: '/bench-vendor/gtag.js',
	'meta-pixel': '/bench-vendor/fbevents.js',
	'tiktok-pixel': '/bench-vendor/tiktok-events.js',
} as const;
