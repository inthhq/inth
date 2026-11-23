import { useRuntimeConfig } from 'nitropack/runtime';

import manifest from '#inth/manifest-snapshot';

import { serverFetch } from './local-fetch';
import { createConsentRoute } from './create-consent-route';

export default createConsentRoute({
	fetch: serverFetch,
	manifest,
	useRuntimeConfig,
});
