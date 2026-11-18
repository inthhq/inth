// #region docs:static-config title="astro.config.mjs"
import svelte from '@astrojs/svelte';
import inth, { hosted } from '@inth/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [svelte(), inth({ mode: hosted() })],
});
// #endregion docs:static-config
