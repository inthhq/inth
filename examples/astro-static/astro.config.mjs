// #region docs:static-config title="astro.config.mjs"
import svelte from '@astrojs/svelte';
import c15t, { hosted } from '@inth/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [svelte(), c15t({ mode: hosted() })],
});
// #endregion docs:static-config
