// #region docs:init
import { posthog } from '@inth/integrations/posthog';
import { init, manifest } from '@inth/sdk';

init({
	mode: manifest(),
	scripts: [
		posthog({
			id: 'phc_your_project_key',
			initOptions: { cookieless_mode: 'never' },
			loadMode: 'after-consent',
		}),
	],
});
// #endregion docs:init
