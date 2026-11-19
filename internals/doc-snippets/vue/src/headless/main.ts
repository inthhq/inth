// #region docs:headless-main title="src/main.ts"
import { inthVue, manifest } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './App.vue';
import { scripts } from './scripts';

createApp(App)
	.use(inthVue, {
		mode: manifest(),
		scripts,
	})
	.mount('#app');
// #endregion docs:headless-main
