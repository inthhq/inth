import { consentManifest } from '@inth/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
	plugins: lazyPlugins(() => [consentManifest(), sveltekit()]),
});
