// #region docs:scripts
import { posthog } from '@inth/integrations/posthog';

export const scripts = [
	// Loads PostHog only after the visitor allows measurement.
	posthog({
		id: 'phc_your_project_key',
		initOptions: { cookieless_mode: 'never' },
		loadMode: 'after-consent',
	}),
];
// #endregion docs:scripts
