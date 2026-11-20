import { createConsentRoute } from '@inth/tanstack-start/api';
import { createFileRoute } from '@tanstack/react-router';

import { getBenchManifestUrl } from '../../../bench/manifest-url';

/**
 * Plain same-origin consent route: `GET /api/inth/v1/consent/manifest`
 * passes the cached fixture manifest through, `GET /api/inth/v1/consent/init`
 * resolves init from
 * it in-process. No proxy, so consent saves go straight to the fixture.
 */
export const Route = createFileRoute('/api/inth/$')({
	server: {
		handlers: createConsentRoute({
			manifestUrl: getBenchManifestUrl(),
		}),
	},
});
