import { createConsentRoute } from '@inth/svelte/kit';

import { testBackend } from '#lib/test-backend.js';

// GET /api/inth/init resolves the visitor from the cached policy manifest.
// GET /api/inth/manifest serves that manifest. Other methods are not handled:
// the browser saves consent to the backend URL directly.
export const { GET } = createConsentRoute({
	projectUrl: 'https://your-project.inth.app',
	...testBackend('projectUrl'),
});
