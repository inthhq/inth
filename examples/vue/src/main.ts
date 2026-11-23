// #region docs:main title="src/main.ts"
import { posthog } from '@inth/integrations/posthog';
import { inth, hosted } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './app.vue';

createApp(App)
	.use(inth, {
		mode: hosted(),
		scripts: [
			posthog({
				id: 'phc_your_project_key',
				initOptions: { cookieless_mode: 'never' },
				loadMode: 'after-consent',
			}),
		],
	})
	.mount('#app');
// #endregion docs:main
