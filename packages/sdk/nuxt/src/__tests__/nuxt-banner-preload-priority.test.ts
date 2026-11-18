/**
 * A visitor the engine serves at once, such as a returning one, gets the
 * stock banner's preloads at low priority, so they do not hold back the
 * page's hero image. The app hydrates without the banner. The engine keeps
 * its priority, since the plugin awaits it before the app mounts, and so
 * does any chunk the app needs.
 */
import { describe, expect, test } from 'vitest';

import { lowerBannerPreloads } from '../../../vue/src/runtime/server/banner-preload-priority';
import { GLOBAL_COMPONENTS } from '../global-components';
import { bannerOnlyFiles, preloadDeferredEngine } from '../prefetch';
import type { ClientManifestChunk } from '../prefetch';

const SRC = '/app';
const isConsentFile = (file: string) => file.includes('/@inth/');
const ENGINE = 'node_modules/@inth/vue/dist/runtime/deferred/engine.js';
const BANNER = 'node_modules/@inth/vue/dist/runtime/components/prompt.vue';

/** A built manifest, before the module's edits. */
const manifest = (): Record<string, ClientManifestChunk> => ({
	'_banner-dep.js': { file: 'BannerDep.js', imports: ['_vue.js'] },
	'_engine-dep.js': { file: 'EngDep.js', imports: ['_vue.js'] },
	'_shared.js': { file: 'Shared.js', imports: ['_vue.js'] },
	'_vue.js': { file: 'Vue.js' },
	[BANNER]: {
		file: 'Prompt.js',
		imports: ['_banner-dep.js', '_shared.js', '_vue.js'],
		isDynamicEntry: true,
		src: BANNER,
	},
	[ENGINE]: {
		file: 'Engine.js',
		imports: ['_engine-dep.js', '_shared.js', '_vue.js'],
		isDynamicEntry: true,
		src: ENGINE,
	},
	'entry.js': {
		dynamicImports: [ENGINE, BANNER],
		file: 'Entry.js',
		imports: ['_vue.js'],
		isEntry: true,
		src: 'entry.js',
	},
});

/** The manifest as the module leaves it for a build with `ssr`. */
const built = (ssr = true) => {
	const edited = manifest();
	preloadDeferredEngine(edited, SRC, isConsentFile, ssr);
	return edited;
};

describe('bannerOnlyFiles', () => {
	test("names the banner's own chunks, not the engine's or shared ones", () => {
		expect(bannerOnlyFiles(built(), SRC, isConsentFile).sort()).toEqual([
			'BannerDep.js',
			'Prompt.js',
		]);
	});

	test('names nothing with ssr: false, where every page preloads the banner', () => {
		expect(bannerOnlyFiles(built(false), SRC, isConsentFile)).toEqual([]);
	});

	test('names nothing a page of the app imports', () => {
		const withPage = built();
		withPage['pages/index.vue'] = {
			file: 'Index.js',
			imports: ['_banner-dep.js'],
			isDynamicEntry: true,
			src: 'pages/index.vue',
		};
		expect(bannerOnlyFiles(withPage, SRC, isConsentFile)).toEqual([
			'Prompt.js',
		]);
	});

	test('keeps what the IAB banner also imports when the build turns IAB on', () => {
		const iabPrompt =
			'node_modules/@inth/vue/dist/runtime/components/iab-prompt.vue';
		const withIab = built();
		withIab[iabPrompt] = {
			file: 'IabPrompt.js',
			imports: ['_banner-dep.js'],
			isDynamicEntry: true,
			src: iabPrompt,
		};
		expect(bannerOnlyFiles(withIab, SRC, isConsentFile, { iab: true })).toEqual(
			['Prompt.js']
		);
		expect(
			bannerOnlyFiles(withIab, SRC, isConsentFile, { iab: false }).sort()
		).toEqual(['BannerDep.js', 'Prompt.js']);
	});

	test('keeps what the experiment controller or browser resolver also imports', () => {
		const controller =
			'node_modules/@inth/sdk/lib/core/dist/libs/experiment-assignment.js';
		const resolver =
			'node_modules/@inth/sdk/lib/core/dist/transports/manifest-browser.js';
		const startup = built();
		startup[controller] = {
			file: 'Experiment.js',
			imports: ['_banner-dep.js'],
			isDynamicEntry: true,
			src: controller,
		};
		expect(bannerOnlyFiles(startup, SRC, isConsentFile)).toEqual(['Prompt.js']);
		const resolving = built();
		resolving[resolver] = {
			file: 'Resolver.js',
			imports: ['_banner-dep.js'],
			isDynamicEntry: true,
			src: resolver,
		};
		expect(
			bannerOnlyFiles(resolving, SRC, isConsentFile, { browserResolve: true })
		).toEqual(['Prompt.js']);
		expect(bannerOnlyFiles(resolving, SRC, isConsentFile).sort()).toEqual([
			'BannerDep.js',
			'Prompt.js',
		]);
	});

	test.each(GLOBAL_COMPONENTS)(
		'keeps what %s, which a page can render, also imports',
		(_name, file) => {
			const component = `node_modules/@inth/vue/dist/runtime/components/${file}.vue`;
			const withComponent = built();
			withComponent[component] = {
				file: 'Component.js',
				imports: ['_banner-dep.js'],
				isDynamicEntry: true,
				src: component,
			};
			expect(bannerOnlyFiles(withComponent, SRC, isConsentFile)).toEqual([
				'Prompt.js',
			]);
		}
	);

	test('finds the banner when the module is loaded from source', () => {
		const source = 'packages/sdk/vue/src/runtime/components/prompt.vue';
		const fromSource = built();
		const { [BANNER]: banner, ...rest } = fromSource;
		const linked = { ...rest, [source]: { ...banner, src: source } };
		expect(bannerOnlyFiles(linked, SRC, () => true).sort()).toEqual([
			'BannerDep.js',
			'Prompt.js',
		]);
	});

	test('keeps what the experiment controller imports when loaded from source', () => {
		const controller = 'packages/sdk/core/src/libs/experiment-assignment.ts';
		const linked = built();
		linked[controller] = {
			file: 'Experiment.js',
			imports: ['_banner-dep.js'],
			isDynamicEntry: true,
			src: controller,
		};
		expect(bannerOnlyFiles(linked, SRC, isConsentFile)).toEqual(['Prompt.js']);
	});

	test('names .mjs chunks too', () => {
		const mjs = built();
		mjs['_banner-dep.js'] = { ...mjs['_banner-dep.js'], file: 'BannerDep.mjs' };
		expect(bannerOnlyFiles(mjs, SRC, isConsentFile)).toContain('BannerDep.mjs');
	});

	test('names nothing without a banner chunk', () => {
		const { [BANNER]: _banner, ...rest } = built();
		expect(bannerOnlyFiles(rest, SRC, isConsentFile)).toEqual([]);
	});
});

describe('lowerBannerPreloads', () => {
	const files = ['Prompt.js', 'BannerDep.js'];

	test("lowers the banner's module preloads only", () => {
		const head = [
			'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/Engine.js">',
			'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/Prompt.js">',
			'<link rel="modulepreload" as="script" crossorigin href="https://cdn.example/_nuxt/BannerDep.js">',
			'<link rel="prefetch" as="script" href="/_nuxt/Prompt.js">',
		].join('');
		expect(lowerBannerPreloads(head, files)).toBe(
			[
				'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/Engine.js">',
				'<link fetchpriority="low" rel="modulepreload" as="script" crossorigin href="/_nuxt/Prompt.js">',
				'<link fetchpriority="low" rel="modulepreload" as="script" crossorigin href="https://cdn.example/_nuxt/BannerDep.js">',
				'<link rel="prefetch" as="script" href="/_nuxt/Prompt.js">',
			].join('')
		);
	});

	test('matches the whole manifest path, not the file name', () => {
		const head = [
			'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/chunks/app/index.js">',
			'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/chunks/banner/index.js">',
		].join('');
		expect(lowerBannerPreloads(head, ['chunks/banner/index.js'])).toBe(
			[
				'<link rel="modulepreload" as="script" crossorigin href="/_nuxt/chunks/app/index.js">',
				'<link fetchpriority="low" rel="modulepreload" as="script" crossorigin href="/_nuxt/chunks/banner/index.js">',
			].join('')
		);
	});

	test('leaves a priority the page set', () => {
		const head =
			'<link rel="modulepreload" fetchpriority="high" href="/_nuxt/Prompt.js">';
		expect(lowerBannerPreloads(head, files)).toBe(head);
	});
});
