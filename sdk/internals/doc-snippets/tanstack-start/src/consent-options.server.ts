// The snippets that import consent options share this module. The docs
// publish the starter's copy, examples/tanstack-start/src/consent-options.server.ts.
import type { ConsentManifestOptions } from 'c15t/tanstack-start/server';

import { consentManifest } from './c15t-manifest';

export const consentOptions = {
	backendURL: 'https://your-project.inth.app',
	manifest: consentManifest,
} satisfies ConsentManifestOptions;
