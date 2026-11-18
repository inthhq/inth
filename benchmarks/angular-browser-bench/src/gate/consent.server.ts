import { createConsentRoute } from '@inth/angular/ssr';

/**
 * The consent route at `/api/c15t`, as in the rendering guide. It resolves
 * `/init` from the backend's manifest and forwards saves. `run-gate.ts` sets
 * `C15T_BACKEND_URL` to the fixture backend `server.ts` mounts, which stands
 * in for Inth and sleeps for the bench's backend latency.
 */
export const consentRoute = createConsentRoute({
	projectUrl:
		process.env['C15T_BACKEND_URL'] ??
		'http://127.0.0.1:4339/api/bench-consent',
	proxy: true,
});
