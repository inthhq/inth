// #region docs:app-config
import { posthog } from '@inth/integrations/posthog';

export default defineAppConfig({
	inth: {
		scripts: [
			posthog({
				id: 'phc_your_project_key',
				initOptions: { cookieless_mode: 'never' },
				loadMode: 'after-consent',
			}),
		],
	},
});
// #endregion docs:app-config
