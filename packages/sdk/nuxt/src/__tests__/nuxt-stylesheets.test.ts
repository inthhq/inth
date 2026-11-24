/**
 * The Nuxt module turns the `<link>`s Nuxt writes for Inth stylesheets it
 * already inlines into preloads. Nuxt drops the link for a chunk named
 * after a component it inlines, but Inth's components share chunks, and
 * each shared chunk's stylesheet stayed a render-blocking `<link>` next to
 * the inlined copy of the same rules. On a throttled phone, those links
 * held the first paint of a page with a banner from about 450 ms to
 * 1,070 ms.
 */
import { describe, expect, test } from 'vite-plus/test';

import type { ClientManifestChunk } from '../prefetch';
import {
	collectStyleSources,
	preloadInlinedConsentStyles,
} from '../stylesheets';
import type { StyleSourceIndex } from '../stylesheets';

const ui = (file: string) =>
	`/repo/node_modules/@inth/sdk/lib/ui/dist/styles/components/${file}`;
const vue = (file: string) =>
	`/repo/node_modules/@inth/vue/dist/runtime/${file}`;

const isConsentFile = (file: string) => file.includes('/@inth/');
const inlineVueStyles = (id?: string) => !!id && id.includes('.vue');

const createIndex = (): StyleSourceIndex =>
	new Map([
		[
			'button.css',
			[{ id: ui('button.css'), importers: [vue('components/button.vue')] }],
		],
		[
			'tag.css',
			[
				{ id: ui('branding.css'), importers: [vue('components/tag.vue')] },
				{
					id: ui('consent-actions.css'),
					importers: [vue('components/actions.vue')],
				},
			],
		],
		[
			'switch.css',
			[
				{
					id: ui('switch.css'),
					importers: [
						vue('components/switch.vue'),
						vue('primitives/switch-variants.ts'),
					],
				},
			],
		],
		[
			'site.css',
			[{ id: '/repo/app/components/site.css', importers: ['/repo/app/a.vue'] }],
		],
		[
			'entry-shared.css',
			[
				{
					id: ui('legal-links.css'),
					importers: [vue('components/legal-links.vue')],
				},
			],
		],
	]);

const createManifest = (): Record<string, ClientManifestChunk> => ({
	'_banner-shared.js': { css: ['button.css', 'tag.css', 'site.css'] },
	'_dialog-shared.js': { css: ['switch.css'] },
	'_entry-shared.js': { css: ['entry-shared.css'] },
	'_unknown.js': { css: ['unknown.css'] },
	'node_modules/@inth/vue/dist/runtime/components/prompt.vue': {
		css: ['button.css'],
		imports: ['_banner-shared.js', '_dialog-shared.js', '_unknown.js'],
		isDynamicEntry: true,
		src: 'node_modules/@inth/vue/dist/runtime/components/prompt.vue',
	},
	'node_modules/nuxt/dist/app/entry.js': {
		imports: ['_entry-shared.js'],
		isEntry: true,
		src: 'node_modules/nuxt/dist/app/entry.js',
	},
});

describe('preloadInlinedConsentStyles', () => {
	test('preloads, instead of linking, inth stylesheets that only Vue components import from lazy chunks', () => {
		const manifest = createManifest();
		preloadInlinedConsentStyles(
			manifest,
			createIndex(),
			inlineVueStyles,
			isConsentFile
		);

		expect(manifest['_banner-shared.js']?.css).toEqual(['site.css']);
		expect(manifest['_banner-shared.js']?.assets).toEqual([
			'button.css',
			'tag.css',
		]);
	});

	test('keeps a stylesheet a script module imports: Nuxt inlines only component imports', () => {
		const manifest = createManifest();
		preloadInlinedConsentStyles(
			manifest,
			createIndex(),
			inlineVueStyles,
			isConsentFile
		);

		expect(manifest['_dialog-shared.js']?.css).toEqual(['switch.css']);
		expect(manifest['_unknown.js']?.css).toEqual(['unknown.css']);
	});

	test("preloads a sibling component's stylesheet from a component's own chunk: Nuxt 4.6 links it when that sibling does not render", () => {
		// Nuxt 4.6 bundles the legal links into the banner's chunk. A banner
		// without legal links renders, Nuxt inlines nothing for them, and the
		// chunk's `<link>` for their stylesheet blocks the first paint.
		const manifest = createManifest();
		preloadInlinedConsentStyles(
			manifest,
			createIndex(),
			inlineVueStyles,
			isConsentFile
		);
		const own =
			manifest['node_modules/@inth/vue/dist/runtime/components/prompt.vue'];

		expect(own?.css).toEqual([]);
		expect(own?.assets).toEqual(['button.css']);
	});

	test("keeps a stylesheet in a component's own chunk that is not Inth's", () => {
		const manifest = createManifest();
		const own =
			manifest['node_modules/@inth/vue/dist/runtime/components/prompt.vue'];
		if (!own) {
			throw new Error('expected the prompt component in the manifest');
		}
		own.css = ['site.css', 'button.css'];
		preloadInlinedConsentStyles(
			manifest,
			createIndex(),
			inlineVueStyles,
			isConsentFile
		);

		expect(own.css).toEqual(['site.css']);
		expect(own.assets).toEqual(['button.css']);
	});

	test('keeps stylesheets the entry imports statically: the browser gets them only from the HTML', () => {
		const manifest = createManifest();
		preloadInlinedConsentStyles(
			manifest,
			createIndex(),
			inlineVueStyles,
			isConsentFile
		);

		expect(manifest['_entry-shared.js']?.css).toEqual(['entry-shared.css']);
	});

	test('changes nothing when Nuxt does not inline inth styles', () => {
		for (const inlineStyles of [
			false,
			(id?: string) => !!id && !id.includes('node_modules'),
		]) {
			const manifest = createManifest();
			preloadInlinedConsentStyles(
				manifest,
				createIndex(),
				inlineStyles,
				isConsentFile
			);

			expect(manifest).toEqual(createManifest());
		}
	});
});

describe('collectStyleSources', () => {
	test('records the stylesheet modules in each CSS file and their importers', () => {
		const index: StyleSourceIndex = new Map();
		const plugin = collectStyleSources(index);
		const generateBundle = plugin.generateBundle as (
			this: unknown,
			options: unknown,
			bundle: Record<string, unknown>
		) => void;
		const importers: Record<string, string[]> = {
			[ui('button.css')]: [vue('components/button.vue')],
		};
		generateBundle.call(
			{ getModuleInfo: (id: string) => ({ importers: importers[id] ?? [] }) },
			{},
			{
				'_nuxt/button.css': { type: 'asset' },
				'_nuxt/plain.js': {
					moduleIds: [vue('kernel.js')],
					type: 'chunk',
					viteMetadata: { importedCss: new Set() },
				},
				'_nuxt/shared.js': {
					moduleIds: [vue('components/button.vue'), ui('button.css')],
					type: 'chunk',
					viteMetadata: { importedCss: new Set(['_nuxt/button.css']) },
				},
			}
		);

		expect([...index]).toEqual([
			[
				'button.css',
				[{ id: ui('button.css'), importers: [vue('components/button.vue')] }],
			],
		]);
	});
});
