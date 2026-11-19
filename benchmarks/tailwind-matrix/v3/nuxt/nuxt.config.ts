// oxlint-disable sort-keys -- PostCSS runs plugins in the order listed.
// #region docs:nuxt-config title="nuxt.config.ts"
import { hosted } from '@inth/nuxt';

export default defineNuxtConfig({
	inth: { projectUrl: '/api/inth', mode: hosted() },
	compatibilityDate: '2026-07-04',
	css: ['~/assets/css/main.css'],
	modules: ['@inth/nuxt'],
	postcss: {
		plugins: {
			'@inth/react/postcss-tailwind3': {},
			tailwindcss: {},
			autoprefixer: {},
		},
	},
	ssr: false,
});
// #endregion docs:nuxt-config
