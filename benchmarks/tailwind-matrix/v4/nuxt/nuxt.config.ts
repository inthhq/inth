// #region docs:nuxt-config title="nuxt.config.ts"
import { hosted } from '@inth/nuxt';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
	compatibilityDate: '2026-07-04',
	css: ['~/assets/css/main.css'],
	inth: { mode: hosted(), projectUrl: '/api/inth' },
	modules: ['@inth/nuxt'],
	ssr: false,
	vite: { plugins: [tailwindcss()] },
});
// #endregion docs:nuxt-config
