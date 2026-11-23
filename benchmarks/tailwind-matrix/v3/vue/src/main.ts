import { inth, hosted } from '@inth/vue/vue-plugin';
import { createApp } from 'vue';

import './style.css';
import App from './App.vue';

createApp(App)
	// #region docs:slot
	.use(inth, {
		components: {
			banner: {
				root: { class: '!p-[7px] dark:!p-[11px]' },
			},
		},
		mode: hosted(),
	})
	// #endregion docs:slot
	.mount('#app');
