import { createConsentRuntime } from '@inth/sdk/runtime';

import { scripts } from './scripts';
import { testBackend } from './test-backend';

// One runtime for the page: policy, stored choices, script loading,
// iframe blocking and the reload after a revocation.
export const runtime = createConsentRuntime({
	projectUrl: 'https://your-project.inth.app',
	...testBackend('projectUrl'),
	scripts,
});
