// #region docs:runtime
import { hosted } from '@inth/sdk/engine';
import { createConsentRuntime } from '@inth/sdk/runtime';

import { scripts } from './scripts';

// One runtime for the page: policy, stored choices, script loading,
// iframe blocking and the reload after a revocation.
export const runtime = createConsentRuntime({
	mode: hosted(),
	projectUrl: 'https://your-project.inth.app',
	scripts,
});
// #endregion docs:runtime
