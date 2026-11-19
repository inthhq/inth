import { createConsentRoute } from '@inth/tanstack-start/api';
import { createFileRoute } from '@tanstack/react-router';

import {
	BENCH_BACKEND_URL,
	getBenchManifestUrl,
} from '../../../bench/manifest-url';

/**
 * Second mount, proxy enabled, for the `manifest-ssr-proxy` arm. The same
 * manifest source URL means it shares the module-level manifest cache with
 * `/api/inth/$`; the difference is that `POST /api/inth-proxy/subjects` is
 * forwarded to the fixture instead of the browser posting there directly.
 */
export const Route = createFileRoute('/api/inth-proxy/$')({
	server: {
		handlers: createConsentRoute({
			manifestUrl: getBenchManifestUrl(),
			projectUrl: BENCH_BACKEND_URL,
			proxy: true,
		}),
	},
});
