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
 *   workspace packages left external so they dedupe against `@inth/sdk-core`.
 * - `dist/postcss-tailwind3.js` — a re-export of `@inth/sdk-ui/postcss-tailwind3`
 *   for Tailwind 3 PostCSS configs.
 * - `dist/inth.js` — the hosted script tag's init script: it starts
 *   `/v1/consent/init`, shows the banner with only the banner's styles, records an
 *   early accept or reject, and loads `dist/inth.hosted.js` after the
 *   page's priority images.
 * - `dist/inth.commit.js` — what the init script fetches when the visitor
 *   taps Accept or Reject on its banner: the record write and the queued
 *   save for that choice. Served next to `dist/inth.hosted.js`.
 * - `dist/inth.records.js` — what the init script fetches at once for a
 *   returning visitor: the stored-record reader. Served next to
 *   `dist/inth.hosted.js`.
 * - `dist/inth.dialog.js` — the stock preference centre and the full
 *   stylesheet. The init script fetches it when the visitor taps Customize
 *   before the engine and opens the dialog without the engine; the engine
 *   fetches it the first time it needs the dialog. Served next to
 *   `dist/inth.hosted.js`.
 * - `dist/inth.hosted.js` — the hosted engine: runtime, the vanilla banner
 *   and trigger, the stylesheet, and auto-init from the `<script>` tag's
 *   `data-*` attributes. It also works as a tag of its own, with
 *   `dist/inth.dialog.js` next to it.
 * - `dist/inth.testing.js` — the stock UI with `testing()`, for test
 *   pages: it resolves a policy in the browser with no backend. Built
 *   without `NODE_ENV=production`, so `testing()` runs; no other file
 *   contains its transport or the policy pack.
 * - `dist/inth.headless.js` — the same without any UI or CSS, for sites
 *   that render their own banner against `window.inth`.
 * - `dist/inth.iab.js` — an optional replacement with the CMP and IAB UI.
 * - `dist/inth.devtools.js` — the DevTools panel as a second tag.
 * - `dist/inth.gpp.js` — IAB GPP as a second tag.
 */
/** What core's snapshot code reads copy through, in the init script. */
const INIT_SNAPSHOT_TRANSLATIONS = fileURLToPath(
	new URL('./src/init/snapshot-translations.ts', import.meta.url)
);

/** Script builds allowed to contain `@inth/sdk-iab` code. */
const IAB_BUNDLES = new Set(['inth.iab', 'inth.gpp']);

/** Script builds that run hosted mode only. */
const HOSTED_BUNDLES = new Set([
	'inth',
	'inth.commit',
	'inth.dialog',
	'inth.hosted',
	'inth.records',
]);

/** Hosted script builds the init script runs before the engine. */
const INIT_BUNDLES = new Set([
	'inth',
	'inth.commit',
	'inth.dialog',
	'inth.records',
]);

/** Script builds that run hosted or manifest mode: no testing transport. */
const PRODUCTION_BUNDLES = new Set(['inth.headless', 'inth.iab', 'inth.gpp']);

/**
 * The ESM build loads the preference centre on demand
 * (`ui/dialog-surface.ts`). A script tag has nowhere to load a chunk from:
 * `inth.hosted.js` loads `inth.dialog.js` instead
 * (`ui/dialog-import-script.ts`), and the other script-tag builds use the
 * dialog module directly.
 */
const dialogModule = (name: string) =>
	name === 'inth.hosted'
		? new rspack.NormalModuleReplacementPlugin(
				/^\.\/dialog-import$/u,
				'./dialog-import-script'
			)
		: new rspack.NormalModuleReplacementPlugin(
				/^\.\/dialog-surface$/u,
				'./dialog'
			);

const scriptTagLib = function scriptTagLib(name: string, entry: string) {
	const source: {
		define?: Record<string, string>;
		entry: Record<string, string>;
	} = { entry: { [name]: entry } };
	// The testing file must let `testing()` run: it is for test pages.
	if (name === 'inth.testing') {
		source.define = { 'process.env.NODE_ENV': JSON.stringify('test') };
	}
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
		source,
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
					// `inth.dialog.js` locks scrolling and traps focus with the
					// functions of the bundle that loaded it (`ui/locks-shared.ts`).
					...(name === 'inth.dialog'
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
					...(HOSTED_BUNDLES.has(name)
						? [modeBundleBoundary(INIT_BUNDLES.has(name) ? 'init' : 'hosted')]
						: []),
					// The init script renders only the banner: it carries the
					// banner's share of the stylesheet and class names, and no
					// copy of its own (`src/init/copy.ts`,
					// `src/init/snapshot-translations.ts`).
					...(name === 'inth'
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
					...(PRODUCTION_BUNDLES.has(name)
						? [modeBundleBoundary('production')]
						: []),
					...(name === 'inth.testing' ? [modeBundleBoundary('testing')] : []),
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
					'postcss-tailwind3': './src/postcss-tailwind3.ts',
					prefetch: './src/prefetch.ts',
					testing: './src/testing.ts',
				},
			},
		},
		scriptTagLib('inth', './src/entries/cdn-init.ts'),
		scriptTagLib('inth.hosted', './src/entries/cdn.ts'),
		scriptTagLib('inth.commit', './src/entries/cdn-commit.ts'),
		scriptTagLib('inth.records', './src/entries/cdn-records.ts'),
		scriptTagLib('inth.dialog', './src/entries/cdn-dialog.ts'),
		scriptTagLib('inth.testing', './src/entries/cdn-testing.ts'),
		scriptTagLib('inth.headless', './src/entries/cdn-headless.ts'),
		scriptTagLib('inth.iab', './src/entries/cdn-iab.ts'),
		scriptTagLib('inth.devtools', './src/entries/cdn-devtools.ts'),
		scriptTagLib('inth.gpp', './src/entries/cdn-gpp.ts'),
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
