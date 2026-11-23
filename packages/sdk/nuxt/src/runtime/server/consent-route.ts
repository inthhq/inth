import { useRuntimeConfig } from 'nitropack/runtime';

import manifest from '#inth/manifest-snapshot';

import { createConsentRoute } from './create-consent-route';
import { serverFetch } from './local-fetch';

export default createConsentRoute({
	fetch: serverFetch,
	manifest,
	useRuntimeConfig,
});
