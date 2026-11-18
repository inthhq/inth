/**
 * `GET /api/c15t/init` — the shipped `@inth/svelte/kit` consent route,
 * pointed at the local manifest fixture. Nothing here re-implements
 * resolution; the bench measures the package. `GET` picks `init` from the
 * path's last segment.
 */
import { createConsentRoute } from '@inth/svelte/kit';

export const { GET } = createConsentRoute({
	manifestUrl: '/api/bench-consent/manifest',
});
