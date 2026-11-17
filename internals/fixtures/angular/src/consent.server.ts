import { createConsentRoute } from '@c15t/angular/ssr';

/**
 * The consent route at `/api/c15t`. It resolves `/init` from the backend's
 * manifest and forwards saves, so the browser only talks to this origin.
 * The backend URL is read at runtime, on the server only. The acceptance
 * suite sets `C15T_BACKEND_URL` to its fixture backend.
 */
export const consentRoute = createConsentRoute({
	backendURL:
		process.env['C15T_BACKEND_URL'] ?? 'https://your-project.inth.app',
	proxy: true,
});
