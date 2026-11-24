import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({ plugins: lazyPlugins(() => [svelte()]) });
