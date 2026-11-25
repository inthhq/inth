import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, rspack } from '@rslib/core';
import type { Rspack } from '@rslib/core';

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
 *   `/v1/consent/init`, starts the scripts a stored choice allows, and
 *   loads `dist/inth.hosted.js` (with `dist/inth.choices.js` beside it when
 *   a banner is owed). It renders no UI.
 * - `dist/inth.records.js` — what the init script fetches at once for a
 *   returning visitor: the stored-record reader. Served next to
 *   `dist/inth.hosted.js`.
 * - `dist/inth.choices.js` — the consent UI a banner needs: the prompt in
 *   each container and the in-place options. The engine fetches it the
 *   first time the page needs one of them, and shares its per-kernel state
 *   with it. Served next to `dist/inth.hosted.js`.
 * - `dist/inth.choices-dialog.js` — the dialog and the opt-in
 *   confirmation: a chunk of `dist/inth.choices.js`, which loads it the
 *   first time the engine needs one of them and shares its runtime with it.
 *   Served next to `dist/inth.choices.js`.
 * - `dist/inth.hosted.js` — the hosted engine: runtime, the banner and
 *   dialog hosts, the trigger, the stock stylesheet, and auto-init from the
 *   `<script>` tag's `data-*` attributes. It also works as a tag of its
 *   own, with `dist/inth.choices.js` next to it.
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
const HOSTED_BUNDLES = new Set(['inth', 'inth.hosted', 'inth.records']);

/** Hosted script builds the init script runs before the engine. */
const INIT_BUNDLES = new Set(['inth', 'inth.records']);

/** The UI parts' loader, from the ESM build's chunks (`ui/parts/load.ts`). */
const PARTS_LOADER = /(?:^|\/)(?:\.\.\/parts\/)?load$/u;

/**
 * Where each script build gets the UI parts. `inth.hosted.js` loads
 * `inth.choices.js` (`ui/parts/load-script.ts`), so a returning visitor
 * who never sees the UI never downloads it; that file, and the other
 * script builds, which stay one file, carry them (`load-static.ts`).
 */
const partsModule = (name: string) =>
	new rspack.NormalModuleReplacementPlugin(PARTS_LOADER, (resource) => {
		if (
			/[\\/]src[\\/]ui[\\/](?:parts|prompt|dialog)$/u.test(resource.context)
		) {
			resource.request = fileURLToPath(
				new URL(
					name === 'inth.hosted'
						? './src/ui/parts/load-script.ts'
						: './src/ui/parts/load-static.ts',
					import.meta.url
				)
			);
		}
	});

/**
 * In `inth.choices.js`, the functions that keep per-kernel state are the
 * engine's, which it publishes on `__inthChoicesEngine` before loading
 * the file (`ui/load-choices-file.ts`).
 */
const CHOICES_ENGINE_MODULES = [
	fileURLToPath(new URL('./src/ui/parts/engine', import.meta.url)),
	fileURLToPath(
		new URL('./src/ui/opt-out-confirmation-state', import.meta.url)
	),
];

/**
 * `inth.choices.js` loads the dialog as a chunk of its own,
 * `inth.choices-dialog.js`, on the file's runtime, so the chunk carries
 * only what the banner does not use. rslib builds `iife` files without
 * chunks; this turns chunk loading back on for that file, with classic
 * `<script>` elements: a module script's failed fetch could stay in the
 * document's module map, and a retry would fail without a request. The
 * URL is set at run time (`src/entries/cdn-choices.ts`), so the default
 * public path's lookup is left out.
 */
const choicesDialogChunk = function choicesDialogChunk(
	config: Rspack.Configuration
): Rspack.Configuration {
	config.output = {
		...config.output,
		asyncChunks: true,
		chunkFilename: '[name].js',
		chunkFormat: 'array-push',
		chunkLoading: 'jsonp',
		chunkLoadingGlobal: '__inthChoicesChunks',
		publicPath: '',
		scriptType: false,
	};
	return config;
};

/** Script builds that run hosted or manifest mode: no testing transport. */
const PRODUCTION_BUNDLES = new Set(['inth.headless', 'inth.iab', 'inth.gpp']);

/**
 * `inth.choices.js` takes the engine modules from the `inth.hosted.js`
 * that loaded it (`window.__inthChoicesEngine`), so it carries no second
 * copy.
 */
const choicesEngineExternal = function choicesEngineExternal({
	context,
	request,
}: {
	context?: string;
	request?: string;
}): Promise<string | undefined> {
	const shared =
		Boolean(context && request?.startsWith('.')) &&
		CHOICES_ENGINE_MODULES.includes(
			resolve(context ?? '', request ?? '').replace(/\.[jt]s$/u, '')
		);
	return Promise.resolve(shared ? 'window __inthChoicesEngine' : undefined);
};

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
			externals: name === 'inth.choices' ? [choicesEngineExternal] : [],
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
			rspack: [
				{
					plugins: [
						// One file has no chunk to load on demand, and an inlined
						// `import()` only adds bytes: mount every module statically.
						new rspack.NormalModuleReplacementPlugin(
							/^\.\/create-runtime$/u,
							'./create-runtime-static'
						),
						partsModule(name),
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
						...(name === 'inth.choices' ? [modeBundleBoundary('choices')] : []),
						// The init script reads copy only through core's snapshot
						// code, and carries no translations of its own
						// (`src/init/snapshot-translations.ts`).
						...(name === 'inth'
							? [
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
				...(name === 'inth.choices' ? [choicesDialogChunk] : []),
			],
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
		scriptTagLib('inth.records', './src/entries/cdn-records.ts'),
		scriptTagLib('inth.choices', './src/entries/cdn-choices.ts'),
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
