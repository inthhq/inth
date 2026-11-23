/**
 * The Nuxt module stops Nuxt prefetching Inth chunks a page loads only
 * after its first banner, or only when it configures them. Every finished
 * prefetch queues main-thread work, and on a page whose `/v1/consent/init` answer
 * arrives while they land, the banner waits behind them.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { breakEntryImportCycles } from '../prefetch/break-entry-import-cycles';
import type { ClientManifestChunk } from '../prefetch/consent-prefetch.model';
import { preloadBrowserResolver } from '../prefetch/preload-browser-resolver';
import { preloadConsentBanner } from '../prefetch/preload-consent-banner';
import { stopPrefetchingConsentChunks } from '../prefetch/stop-prefetching-consent-chunks';

/** The shared parts @inth/sdk installs under its `lib/`. */
const SDK_PARTS = new Set(['core', 'iab', 'schema', 'translations', 'ui']);
const inth = (path: string) =>
	SDK_PARTS.has(path.split('/')[0] ?? '')
		? `../node_modules/@inth/sdk/lib/${path}`
		: `../node_modules/@inth/${path}`;

const createManifest = (): Record<string, ClientManifestChunk> => ({
	'_dialog-shared.js': { css: ['dialog.css'], prefetch: true },
	'_shared-kernel.js': { prefetch: true },
	'_vue.js': { prefetch: true },
	'dialog.css': { prefetch: true },
	'node_modules/nuxt/dist/app/components/error-404.vue': {
		imports: ['_vue.js'],
		isDynamicEntry: true,
		prefetch: true,
		src: 'node_modules/nuxt/dist/app/components/error-404.vue',
	},
	'node_modules/nuxt/dist/app/entry.js': {
		dynamicImports: [
			inth('core/dist/modules/script-loader/loader.js'),
			inth('core/dist/runtime/provider-update.js'),
			inth('vue/dist/runtime/components/dialog/manager.vue'),
			inth('vue/dist/runtime/components/iab-prompt.vue'),
			inth('iab/dist/index.js'),
			inth('core/dist/transports/manifest-browser.js'),
			'node_modules/nuxt/dist/app/components/error-404.vue',
		],
		imports: ['_vue.js', '_shared-kernel.js'],
		isEntry: true,
		prefetch: true,
		src: 'node_modules/nuxt/dist/app/entry.js',
	},
	[inth('core/dist/modules/script-loader/loader.js')]: {
		isDynamicEntry: true,
		prefetch: true,
		src: inth('core/dist/modules/script-loader/loader.js'),
	},
	[inth('core/dist/runtime/provider-update.js')]: {
		isDynamicEntry: true,
		prefetch: true,
		src: inth('core/dist/runtime/provider-update.js'),
	},
	[inth('vue/dist/runtime/components/dialog/manager.vue')]: {
		imports: ['_dialog-shared.js', '_vue.js', '_shared-kernel.js'],
		isDynamicEntry: true,
		prefetch: true,
		src: inth('vue/dist/runtime/components/dialog/manager.vue'),
	},
	[inth('vue/dist/runtime/components/iab-prompt.vue')]: {
		isDynamicEntry: true,
		prefetch: true,
		src: inth('vue/dist/runtime/components/iab-prompt.vue'),
	},
	[inth('iab/dist/index.js')]: {
		isDynamicEntry: true,
		prefetch: true,
		src: inth('iab/dist/index.js'),
	},
	[inth('core/dist/transports/manifest-browser.js')]: {
		isDynamicEntry: true,
		prefetch: true,
		src: inth('core/dist/transports/manifest-browser.js'),
	},
});

const isConsentFile = (file: string) => file.includes('/@inth/');

const prefetched = (manifest: Record<string, ClientManifestChunk>) =>
	Object.entries(manifest)
		.filter(([, chunk]) => chunk.prefetch)
		.map(([key]) => key.replace('../node_modules/@inth/', '@inth/'))
		.sort();

describe('stopPrefetchingConsentChunks', () => {
	test('keeps hints for chunks a first banner can need and for everything else in the app', () => {
		const manifest = createManifest();
		stopPrefetchingConsentChunks(manifest, '/app', isConsentFile);

		expect(prefetched(manifest)).toEqual([
			'_shared-kernel.js',
			'_vue.js',
			'node_modules/nuxt/dist/app/components/error-404.vue',
			'node_modules/nuxt/dist/app/entry.js',
		]);
	});

	test('drops the IAB banner, its CMP and their styles unless the build turns IAB on', () => {
		const manifest = createManifest();
		const banner = manifest[inth('vue/dist/runtime/components/iab-prompt.vue')];
		if (banner) {
			banner.css = ['iab-prompt.css'];
			banner.imports = ['_iab-headless.js'];
		}
		manifest['iab-prompt.css'] = { prefetch: true };
		manifest['_iab-headless.js'] = { prefetch: true };
		stopPrefetchingConsentChunks(manifest, '/app', isConsentFile);

		for (const key of [
			inth('iab/dist/index.js'),
			inth('vue/dist/runtime/components/iab-prompt.vue'),
			'_iab-headless.js',
			'iab-prompt.css',
		]) {
			expect(manifest[key]?.prefetch, key).toBe(false);
		}
	});

	test('keeps the IAB banner and its CMP when the build turns IAB on', () => {
		const manifest = createManifest();
		stopPrefetchingConsentChunks(manifest, '/app', isConsentFile, {
			iab: true,
		});

		expect(prefetched(manifest)).toEqual([
			'@inth/sdk/lib/iab/dist/index.js',
			'@inth/vue/dist/runtime/components/iab-prompt.vue',
			'_shared-kernel.js',
			'_vue.js',
			'node_modules/nuxt/dist/app/components/error-404.vue',
			'node_modules/nuxt/dist/app/entry.js',
		]);
	});

	test('drops the hints for on-demand modules, live updates and the dialog with its own chunks and styles', () => {
		const manifest = createManifest();
		stopPrefetchingConsentChunks(manifest, '/app', isConsentFile);

		for (const key of [
			inth('core/dist/modules/script-loader/loader.js'),
			inth('core/dist/runtime/provider-update.js'),
			inth('vue/dist/runtime/components/dialog/manager.vue'),
			'_dialog-shared.js',
			'dialog.css',
		]) {
			expect(manifest[key]?.prefetch, key).toBe(false);
		}
	});

	test("keeps the browser resolver's hint only for browser resolution", () => {
		// Server resolution and hosted mode never import the resolver and its
		// translations at startup; a hint downloaded them on every page.
		const hosted = createManifest();
		stopPrefetchingConsentChunks(hosted, '/app', isConsentFile, {
			browserResolve: false,
		});
		const client = createManifest();
		stopPrefetchingConsentChunks(client, '/app', isConsentFile, {
			browserResolve: true,
		});
		const key = inth('core/dist/transports/manifest-browser.js');

		expect(hosted[key]?.prefetch).toBe(false);
		expect(client[key]?.prefetch).toBe(true);
	});

	test('a chunk the app also reaches keeps its hint', () => {
		const manifest = createManifest();
		const entry = manifest['node_modules/nuxt/dist/app/entry.js'];
		entry?.imports?.push('_dialog-shared.js');
		stopPrefetchingConsentChunks(manifest, '/app', isConsentFile);

		expect(manifest['_dialog-shared.js']?.prefetch).toBe(true);
		expect(manifest['dialog.css']?.prefetch).toBe(true);
	});

	test('reads package names from disk by default', () => {
		const manifest: Record<string, ClientManifestChunk> = {
			'src/runtime/components/dialog/manager.vue': {
				isDynamicEntry: true,
				prefetch: true,
				src: 'runtime/components/dialog/manager.vue',
			},
		};
		// This package (`@inth/vue`) owns the source; Vite roots it at `src`.
		stopPrefetchingConsentChunks(manifest, join(__dirname, '..'));

		expect(
			manifest['src/runtime/components/dialog/manager.vue']?.prefetch
		).toBe(false);
	});
});

describe('preloadConsentBanner', () => {
	const banner = inth('vue/dist/runtime/components/prompt/prompt.vue');
	const entry = 'node_modules/nuxt/dist/app/entry.js';
	const createBannerManifest = (): Record<string, ClientManifestChunk> => ({
		'_vue.js': {},
		[banner]: {
			imports: ['_vue.js'],
			isDynamicEntry: true,
			src: banner,
		},
		[entry]: {
			dynamicImports: [banner],
			imports: ['_vue.js'],
			isEntry: true,
			src: entry,
		},
	});

	test('lists the banner chunk among the entry imports, so every page preloads it', () => {
		const manifest = createBannerManifest();
		preloadConsentBanner(manifest, '/app', isConsentFile);
		preloadConsentBanner(manifest, '/app', isConsentFile);

		expect(manifest[entry]?.imports).toEqual(['_vue.js', banner]);
		expect(manifest[entry]?.dynamicImports).toEqual([banner]);
	});

	test('leaves a manifest without the inth banner alone', () => {
		const manifest = createBannerManifest();
		preloadConsentBanner(manifest, '/app', () => false);

		expect(manifest[entry]?.imports).toEqual(['_vue.js']);
	});
});

describe('preloadBrowserResolver', () => {
	test("lists core's browser resolver among the entry imports", () => {
		const resolver = inth('core/dist/transports/manifest-browser.js');
		const entry = 'node_modules/nuxt/dist/app/entry.js';
		const manifest: Record<string, ClientManifestChunk> = {
			[resolver]: { isDynamicEntry: true, src: resolver },
			[entry]: { dynamicImports: [resolver], isEntry: true, src: entry },
		};
		preloadBrowserResolver(manifest, '/app', isConsentFile);

		expect(manifest[entry]?.imports).toEqual([resolver]);
	});
});

describe('breakEntryImportCycles', () => {
	const entry = 'node_modules/nuxt/dist/app/entry.js';
	// Rolldown's manifest for the Inth chunk group lists the entry among the
	// group's imports although the entry imports the group statically.
	const cyclicManifest = (): Record<string, ClientManifestChunk> => ({
		'_inth.js': { imports: ['_vue.js', entry] },
		'_vue.js': {},
		[inth('vue/dist/runtime/components/prompt/prompt.vue')]: {
			imports: ['_vue.js', '_inth.js', entry],
			isDynamicEntry: true,
		},
		[entry]: { imports: ['_vue.js', '_inth.js'], isEntry: true },
	});

	test('drops the entry from chunks the entry imports', () => {
		const manifest = cyclicManifest();
		breakEntryImportCycles(manifest);
		expect(manifest['_inth.js']?.imports).toEqual(['_vue.js']);
		expect(manifest[entry]?.imports).toEqual(['_vue.js', '_inth.js']);
	});

	test('keeps the entry in chunks that load on demand', () => {
		const manifest = cyclicManifest();
		breakEntryImportCycles(manifest);
		expect(
			manifest[inth('vue/dist/runtime/components/prompt/prompt.vue')]?.imports
		).toContain(entry);
	});
});
