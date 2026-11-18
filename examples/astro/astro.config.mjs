// #region docs:server-config title="astro.config.mjs"
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import c15t from '@inth/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
	adapter: node({ mode: 'standalone' }),
	integrations: [svelte(), c15t()],
	output: 'server',
});
// #endregion docs:server-config
