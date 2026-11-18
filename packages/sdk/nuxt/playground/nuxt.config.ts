export default defineNuxtConfig({
	inth: {
		consentCategories: ['necessary', 'measurement', 'marketing'],
		projectUrl: 'https://nuxt-consent-io.inth.app',
	},
	devtools: { enabled: true },
	modules: ['../src/module'],
});
