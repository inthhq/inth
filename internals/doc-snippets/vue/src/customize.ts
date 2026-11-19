// #region docs:customize title="src/main.ts"
import { inthVue, manifest } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './App.vue';
import { scripts } from './scripts';

createApp(App)
	.use(inthVue, {
		components: {
			banner: { card: { class: 'brand-consent-card' } },
		},
		mode: manifest(),
		presentation: {
			prompt: { position: 'bottom', variant: 'bar' },
		},
		scripts,
		tokens: {
			'inth-primary': '#6943a3',
			'inth-primary-hover': '#533285',
			'inth-radius-lg': '18px',
			'inth-text-on-primary': '#ffffff',
		},
	})
	.mount('#app');
// #endregion docs:customize
