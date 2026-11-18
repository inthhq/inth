import { createConsentRoute } from '@c15t/angular/ssr';

/**
 * The consent route at `/api/c15t`. It resolves `/init` from the backend's
 * manifest and forwards saves, so the browser only talks to this origin.
 * The backend URL is read at runtime, on the server only.
 */
export const consentRoute = createConsentRoute({
	projectUrl:
		process.env['C15T_BACKEND_URL'] ?? 'https://example-inth.inth.app',
	proxy: true,
});
