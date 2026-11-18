export default defineNuxtConfig({
	c15t: {
		consentCategories: ['necessary', 'measurement', 'marketing'],
		projectUrl: 'https://nuxt-consent-io.inth.app',
	},
	devtools: { enabled: true },
	modules: ['../src/module'],
});
