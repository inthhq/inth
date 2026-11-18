// #region docs:astro-config title="astro.config.mjs"
import svelte from '@astrojs/svelte';
import inth, { hosted } from '@inth/astro';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [
		svelte(),
		inth({
			// A static site: the browser asks the backend's /init.
			mode: hosted(),
			projectUrl: 'https://your-project.inth.app',
		}),
	],
	vite: { plugins: [tailwindcss()] },
});
// #endregion docs:astro-config
