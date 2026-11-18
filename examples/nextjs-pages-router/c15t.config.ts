// #region docs:pages-config title="c15t.config.ts"
import { posthog } from '@inth/integrations/posthog';
import { defineConsentConfig } from '@inth/nextjs';

export default defineConsentConfig({
	routePrefix: '/api/c15t',
	scripts: [
		posthog({
			id: 'phc_your_project_key',
			initOptions: { cookieless_mode: 'never' },
			loadMode: 'after-consent',
		}),
	],
});
// #endregion docs:pages-config
