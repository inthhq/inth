import { consentManifest } from '@inth/svelte/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			preprocess: vitePreprocess(),
		}),
		// Lets inthHandle preload the script loader on pages with scripts. The
		// areas of this app use different backends, so a build without a
		// backend URL keeps going and each server load reads its policy at
		// runtime.
		consentManifest({ onBuildError: 'runtime' }),
	],
	ssr: {
		// Transform workspace CSS imports instead of passing them to Node's loader.
		noExternal: ['@inth/sdk'],
	},
});
