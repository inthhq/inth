import { fileURLToPath } from 'node:url';

import { defineConfig, rspack } from '@rslib/core';

import {
	getRsdoctorPlugins,
	standardExcludePatterns,
} from '../shared/rslib-utils';
import { iabBundleBoundary } from './scripts/iab-bundle-boundary';
import { modeBundleBoundary } from './scripts/mode-bundle-boundary';

/**
 * ESM entries and standalone script builds from one source tree:
 *
 * - `dist/index.js` + `dist/headless.js` — ESM for bundler users, with the
 *   workspace packages left external so they dedupe against `@c15t/core`.
 * - `dist/postcss-tailwind3.js` — a re-export of `@c15t/ui/postcss-tailwind3`
 *   for Tailwind 3 PostCSS configs.
 * - `dist/c15t.js` — the hosted script tag's init script: it starts
 *   `/init`, shows the banner with only the banner's styles, records an
 *   early accept or reject, and loads `dist/c15t.hosted.js` after the
 *   page's priority images.
 * - `dist/c15t.commit.js` — what the init script fetches when the visitor
 *   taps Accept or Reject on its banner: the record write and the queued
 *   save for that choice. Served next to `dist/c15t.hosted.js`.
 * - `dist/c15t.records.js` — what the init script fetches at once for a
 *   returning visitor: the stored-record reader. Served next to
 *   `dist/c15t.hosted.js`.
 * - `dist/c15t.dialog.js` — the stock preference centre and the full
 *   stylesheet. The init script fetches it when the visitor taps Customize
 *   before the engine and opens the dialog without the engine; the engine
 *   fetches it the first time it needs the dialog. Served next to
 *   `dist/c15t.hosted.js`.
 * - `dist/c15t.hosted.js` — the hosted engine: runtime, the vanilla banner
 *   and trigger, the stylesheet, and auto-init from the `<script>` tag's
 *   `data-*` attributes. It also works as a tag of its own, with
 *   `dist/c15t.dialog.js` next to it.
 * - `dist/c15t.local.js` — the stock UI with local policy resolution.
 *   `dist/c15t.offline.js` is its deprecated old name.
 * - `dist/c15t.headless.js` — the same without any UI or CSS, for sites
 *   that render their own banner against `window.c15t`.
 * - `dist/c15t.iab.js` — an optional replacement with the CMP and IAB UI.
 * - `dist/c15t.devtools.js` — the DevTools panel as a second tag.
 * - `dist/c15t.gpp.js` — IAB GPP as a second tag.
 */
/** What core's snapshot code reads copy through, in the init script. */
const INIT_SNAPSHOT_TRANSLATIONS = fileURLToPath(
	new URL('./src/init/snapshot-translations.ts', import.meta.url)
);

/** Script builds allowed to contain `@c15t/iab` code. */
const IAB_BUNDLES = new Set(['c15t.iab', 'c15t.gpp']);

/** Script builds that run hosted mode only. */
const HOSTED_BUNDLES = new Set([
	'c15t',
	'c15t.commit',
	'c15t.dialog',
	'c15t.hosted',
	'c15t.records',
]);

/** Script builds that run local mode only. */
const LOCAL_BUNDLES = new Set(['c15t.local', 'c15t.offline']);

/**
 * The ESM build loads the preference centre on demand
 * (`ui/dialog-surface.ts`). A script tag has nowhere to load a chunk from:
 * `c15t.hosted.js` loads `c15t.dialog.js` instead
 * (`ui/dialog-import-script.ts`), and the other script-tag builds use the
 * dialog module directly.
 */
const dialogModule = (name: string) =>
	name === 'c15t.hosted'
		? new rspack.NormalModuleReplacementPlugin(
				/^\.\/dialog-import$/u,
				'./dialog-import-script'
			)
		: new rspack.NormalModuleReplacementPlugin(
				/^\.\/dialog-surface$/u,
				'./dialog'
			);

const scriptTagLib = function scriptTagLib(name: string, entry: string) {
	return {
		autoExternal: false,
		dts: false,
		format: 'iife' as const,
		output: {
			distPath: { root: './dist' },
			filename: { js: '[name].js' },
			// rslib minifies `iife` output as a module, which may unwrap the
			// function: a classic `<script>` then declares its names globally,
			// and two files loaded on one page clash. Minify as a script.
			minify: {
				jsOptions: { minimizerOptions: { module: false } },
			},
		},
		source: {
			entry: { [name]: entry },
		},
		// A fixed target keeps the CDN file readable by every browser that
		// still receives security updates, independent of the host's
		// browserslist.
		syntax: 'es2020' as const,
		tools: {
			rspack: {
				plugins: [
					// One file has no chunk to load on demand, and an inlined
					// `import()` only adds bytes: mount every module statically.
					new rspack.NormalModuleReplacementPlugin(
						/^\.\/create-runtime$/u,
						'./create-runtime-static'
					),
					dialogModule(name),
					// `c15t.dialog.js` locks scrolling and traps focus with the
					// functions of the bundle that loaded it (`ui/locks-shared.ts`).
					...(name === 'c15t.dialog'
						? [
								new rspack.NormalModuleReplacementPlugin(
									/^\.\/locks$/u,
									'./locks-shared'
								),
							]
						: []),
					// The write code is in the file already: no loader, no preload.
					new rspack.NormalModuleReplacementPlugin(
						/^\.\/writer-loader(?:\.js)?$/u,
						(resource) => {
							resource.request = resource.request.replace(
								'writer-loader',
								'writer-loader-static'
							);
						}
					),
					...(IAB_BUNDLES.has(name) ? [] : [iabBundleBoundary()]),
					...(HOSTED_BUNDLES.has(name) ? [modeBundleBoundary('hosted')] : []),
					// The init script renders only the banner: it carries the
					// banner's share of the stylesheet and class names, and no
					// copy of its own (`src/init/copy.ts`,
					// `src/init/snapshot-translations.ts`).
					...(name === 'c15t'
						? [
								new rspack.NormalModuleReplacementPlugin(
									/generated[\\/]styles(?:\.ts)?$/u,
									(resource) => {
										resource.request = resource.request.replace(
											/styles(?:\.ts)?$/u,
											'banner-styles'
										);
									}
								),
								new rspack.NormalModuleReplacementPlugin(
									/^\.\/copy$/u,
									(resource) => {
										if (/[\\/]src[\\/]ui$/u.test(resource.context)) {
											resource.request = '../init/copy';
										}
									}
								),
								new rspack.NormalModuleReplacementPlugin(
									/^\.\.\/translations\/index\.js$/u,
									(resource) => {
										if (
											/[\\/]core[\\/]dist[\\/]kernel$/u.test(resource.context)
										) {
											resource.request = INIT_SNAPSHOT_TRANSLATIONS;
										}
									}
								),
							]
						: []),
					...(LOCAL_BUNDLES.has(name) ? [modeBundleBoundary('offline')] : []),
				],
			},
		},
	};
};

export default defineConfig({
	lib: [
		{
			bundle: true,
			dts: {
				distPath: './dist-types',
			},
			format: 'esm',
			source: {
				entry: {
					devtools: './src/devtools.ts',
					gpp: './src/gpp.ts',
					headless: './src/headless.ts',
					hosted: './src/hosted.ts',
					iab: './src/iab.ts',
					index: './src/index.ts',
					offline: './src/offline.ts',
					'postcss-tailwind3': './src/postcss-tailwind3.ts',
					prefetch: './src/prefetch.ts',
				},
			},
		},
		scriptTagLib('c15t', './src/entries/cdn-init.ts'),
		scriptTagLib('c15t.hosted', './src/entries/cdn.ts'),
		scriptTagLib('c15t.commit', './src/entries/cdn-commit.ts'),
		scriptTagLib('c15t.records', './src/entries/cdn-records.ts'),
		scriptTagLib('c15t.dialog', './src/entries/cdn-dialog.ts'),
		scriptTagLib('c15t.local', './src/entries/cdn-local.ts'),
		scriptTagLib('c15t.offline', './src/entries/cdn-offline.ts'),
		scriptTagLib('c15t.headless', './src/entries/cdn-headless.ts'),
		scriptTagLib('c15t.iab', './src/entries/cdn-iab.ts'),
		scriptTagLib('c15t.devtools', './src/entries/cdn-devtools.ts'),
		scriptTagLib('c15t.gpp', './src/entries/cdn-gpp.ts'),
	],
	output: {
		cleanDistPath: true,
		target: 'web',
	},
	source: {
		exclude: standardExcludePatterns,
	},
	tools: {
		rspack: {
			plugins: [...getRsdoctorPlugins()],
		},
	},
});
