// #region docs:nuxt-config title="nuxt.config.ts"
import tailwindcss from '@tailwindcss/vite';
import { hosted } from 'c15t/vue';

export default defineNuxtConfig({
	c15t: { mode: hosted(), projectUrl: '/api/c15t' },
	compatibilityDate: '2026-07-04',
	css: ['~/assets/css/main.css'],
	modules: ['c15t/vue'],
	ssr: false,
	vite: { plugins: [tailwindcss()] },
});
// #endregion docs:nuxt-config
