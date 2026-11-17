// #region docs:transport-offline title="src/consent-runtime.ts"

import { testing } from '@c15t/browser/testing';
import { policyRulePresets } from 'c15t';
import { createConsentRuntime } from 'c15t/runtime';

// No backend: rules resolve in the browser and choices stay there. The
// browser does not know the visitor's country, so the page supplies it.
export const runtime = createConsentRuntime({
	mode: testing({
		policy: [
			policyRulePresets.europeOptIn(),
			policyRulePresets.worldNone(),
		],
	}),
	overrides: { country: document.documentElement.dataset.country },
});
// #endregion docs:transport-offline
