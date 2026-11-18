// #region docs:iab-opt-in title="src/main.ts"
import { inthVue, hosted } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './App.vue';

createApp(App)
	.use(inthVue, {
		// Turns IAB TCF on. The CMP ID and vendor list come from `/init`.
		iab: {},
		mode: hosted(),
	})
	.mount('#app');
// #endregion docs:iab-opt-in
