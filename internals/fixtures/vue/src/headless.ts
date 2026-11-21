import { inth } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import App from './HeadlessApp.vue';
import { scripts } from './scripts';
import { testBackend } from './test-backend';

createApp(App)
	.use(inth, {
		projectUrl: 'https://your-project.inth.app',
		...testBackend('projectUrl'),
		scripts,
	})
	.mount('#app');
