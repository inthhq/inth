export default defineNuxtConfig({
	devtools: { enabled: true },
	inth: {
		consentCategories: ['necessary', 'measurement', 'marketing'],
		projectUrl: 'https://nuxt-consent-io.inth.app',
	},
	modules: ['../src/module'],
});
