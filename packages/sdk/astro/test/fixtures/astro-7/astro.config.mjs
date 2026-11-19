// The smallest site that shows which stylesheets a dialog island's page
// ends up with. `src/__tests__/astro-build.test.ts` builds it once per `ui`.
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import inth from '@inth/astro';
import { testing } from '@inth/astro/testing';
import { MINIMAL_GVL } from '@inth/conformance/fixtures/gvl';
import { defineConfig } from 'astro/config';

const ui = process.env.INTH_UI ?? 'svelte';
const iab = process.env.INTH_IAB === '1';
const deferred = process.env.INTH_DEFERRED === '1';

export default defineConfig({
	adapter: deferred
		? {
				hooks: {
					'astro:config:done': ({ setAdapter }) => {
						setAdapter({
							entrypointResolution: 'auto',
							name: 'inth:test-server-island',
							serverEntrypoint: new URL('./server.mjs', import.meta.url),
							supportedAstroFeatures: {
								i18nDomains: 'stable',
								serverOutput: 'stable',
								sharpImageService: 'stable',
								staticOutput: 'stable',
							},
						});
					},
				},
				name: 'inth:test-server-island',
			}
		: undefined,
	cacheDir: process.env.INTH_ASTRO_CACHE_DIR,
	integrations: [
		...(deferred
			? [
					{
						hooks: {
							'astro:config:setup': ({ injectRoute }) => {
								injectRoute({
									entrypoint: new URL('./deferred.astro', import.meta.url),
									pattern: '/deferred',
									prerender: false,
								});
							},
						},
						name: 'inth:test-deferred-route',
					},
				]
			: []),
		ui === 'react' ? react() : svelte(),
		inth({
			consentCategories: ['necessary', 'marketing'],
			endpoints: false,
			iab: iab ? { cmpId: 160, gvl: MINIMAL_GVL } : undefined,
			mode: testing({
				policy: [
					{
						categories: ['marketing'],
						id: 'default',
						match: { fallback: true, isDefault: true },
						model: iab ? 'iab' : 'opt-in',
						prompt: 'choice',
						scopeMode: 'permissive',
					},
				],
			}),
			ui,
		}),
	],
	vite: {
		cacheDir: process.env.INTH_VITE_CACHE_DIR,
	},
});
