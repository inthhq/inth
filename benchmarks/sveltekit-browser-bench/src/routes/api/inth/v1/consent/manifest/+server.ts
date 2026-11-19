/**
 * `GET /api/inth/v1/consent/manifest` — the shipped `@inth/svelte/kit` consent route,
 * serving the fixture's manifest with its cache headers. `GET` picks
 * `manifest` from the path's last segment.
 */
import { createConsentRoute } from '@inth/svelte/kit';

export const { GET } = createConsentRoute({
	manifestUrl: '/api/bench-consent/v1/consent/manifest',
});
