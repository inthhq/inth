import { useRuntimeConfig } from 'nitropack/runtime';

import manifest from '#inth/manifest-snapshot';

import { createConsentRoute } from './create-consent-route';
import { serverFetch } from './server-fetch';

export default createConsentRoute({
	fetch: serverFetch,
	manifest,
	useRuntimeConfig,
});
