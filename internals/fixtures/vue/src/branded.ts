import { inthVue } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './App.vue';
import { scripts } from './scripts';
import { testBackend } from './test-backend';

createApp(App)
	.use(inthVue, {
		projectUrl: 'https://your-project.inth.app',
		...testBackend('projectUrl'),
		components: {
			banner: { card: { class: 'brand-consent-card' } },
		},
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
