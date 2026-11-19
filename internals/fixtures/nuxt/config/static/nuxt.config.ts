import { manifest } from '@inth/nuxt';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
	inth: {
		// No server: the browser reads the backend's manifest and resolves the
		// policy itself.
		mode: manifest({ resolve: 'browser', source: 'runtime' }),
		projectUrl: 'https://your-project.inth.app',
		routePrefix: false,
	},
	modules: ['@inth/nuxt'],
	ssr: false,
});
