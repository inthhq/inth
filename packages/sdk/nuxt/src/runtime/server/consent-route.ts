import { useRuntimeConfig } from 'nitropack/runtime';

import manifest from '#inth/manifest-snapshot';

import { serverFetch } from './local-fetch';
import { createConsentRoute } from './route-factories';

export default createConsentRoute({
	fetch: serverFetch,
	manifest,
	useRuntimeConfig,
});
