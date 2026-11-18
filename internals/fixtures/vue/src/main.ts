import { c15tVue } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './App.vue';
import { scripts } from './scripts';
import { testBackend } from './test-backend';

createApp(App)
	.use(c15tVue, {
		projectUrl: 'https://your-project.inth.app',
		...testBackend('projectUrl'),
		scripts,
	})
	.mount('#app');
