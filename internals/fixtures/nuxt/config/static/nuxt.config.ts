import { manifest } from '@inth/vue';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
	c15t: {
		// No server: the browser reads the backend's manifest and resolves the
		// policy itself.
		mode: manifest({ resolve: 'browser', source: 'runtime' }),
		projectUrl: 'https://your-project.inth.app',
		routePrefix: false,
	},
	modules: ['@inth/vue'],
	ssr: false,
});
