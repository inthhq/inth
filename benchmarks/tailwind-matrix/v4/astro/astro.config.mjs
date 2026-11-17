// #region docs:astro-config title="astro.config.mjs"
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import c15t, { hosted } from 'c15t/astro';

export default defineConfig({
	integrations: [
		svelte(),
		c15t({
			// A static site: the browser asks the backend's /init.
			mode: hosted(),
			projectUrl: 'https://your-project.inth.app',
		}),
	],
	vite: { plugins: [tailwindcss()] },
});
// #endregion docs:astro-config
