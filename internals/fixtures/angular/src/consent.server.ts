import { createConsentRoute } from '@inth/angular/ssr';

/**
 * The consent route at `/api/inth`. It resolves `/init` from the backend's
 * manifest and forwards saves, so the browser only talks to this origin.
 * The backend URL is read at runtime, on the server only. The acceptance
 * suite sets `INTH_PROJECT_URL` to its fixture backend.
 */
export const consentRoute = createConsentRoute({
	projectUrl:
		process.env['INTH_PROJECT_URL'] ?? 'https://your-project.inth.app',
	proxy: true,
});
