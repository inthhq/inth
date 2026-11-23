// #region docs:headless-main title="src/main.ts"
import { inth, manifest } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './app.vue';
import { scripts } from './scripts';

createApp(App)
	.use(inth, {
		mode: manifest(),
		scripts,
	})
	.mount('#app');
// #endregion docs:headless-main
