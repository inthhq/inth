// NOTE: This package uses vitest (not bun test) because @testing-library/svelte
// requires the @sveltejs/vite-plugin-svelte transform pipeline for component
// compilation.
//
// Three projects, because Svelte 5 dual-compiles components:
// - `client` resolves the `browser` condition and gets client-compiled
//   components, which is what `mount` and @testing-library/svelte need.
// - `ssr` resolves `svelte`/`node` and gets server-compiled components, which
//   is what `render()` from `svelte/server` needs. Files ending in
//   `.ssr.test.ts` run here.
// - `browser` runs files ending in `.browser.test.ts` in headless Chromium,
//   for behaviour jsdom has no layout for, such as which elements can take
//   focus.
import { resolve } from 'node:path';

import { baseConfig } from '@inth/vitest-config/base';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { transformWithEsbuild, defineConfig, mergeConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

import { privateSdkNames } from '../shared/private-sdk-names';

const tracingRecipePath = resolve(
	__dirname,
	'../../../internals/doc-snippets/sveltekit/src/lib/server/trace-consent.ts'
);

const workspaceAliases = [
	// SvelteKit resolves `$app/env` in an app; tests read a stand-in.
	{
		find: '$app/env',
		replacement: resolve(__dirname, 'src/lib/kit/__tests__/app-env.ts'),
	},
	// And `$app/server`, whose `getRequestEvent()` a test sets.
	{
		find: '$app/server',
		replacement: resolve(__dirname, 'src/lib/kit/__tests__/app-server.ts'),
	},
	{
		find: '@inth/sdk/build',
		replacement: resolve(__dirname, '../core/src/build.ts'),
	},
	{
		find: '@inth/sdk/generated',
		replacement: resolve(__dirname, 'src/lib/__tests__/generated.ts'),
	},
	{
		find: '@inth/sdk/events',
		replacement: resolve(__dirname, '../core/src/events.ts'),
	},
	{
		find: '@inth/sdk/modes',
		replacement: resolve(__dirname, '../core/src/modes.ts'),
	},
	{
		find: '@inth/sdk/testing',
		replacement: resolve(__dirname, '../core/src/testing.ts'),
	},
	{
		find: '@inth/sdk/transports/manifest-browser',
		replacement: resolve(
			__dirname,
			'../core/src/transports/manifest-browser.ts'
		),
	},
	{
		find: '@inth/sdk/transports',
		replacement: resolve(__dirname, '../core/src/transports/index.ts'),
	},
	{
		find: '@inth/sdk/runtime/client-mode',
		replacement: resolve(__dirname, '../core/src/runtime/client-mode.ts'),
	},
	{
		find: '@inth/sdk/runtime/provider',
		replacement: resolve(__dirname, '../core/src/runtime/provider.ts'),
	},
	{
		find: '@inth/sdk/runtime/on-demand',
		replacement: resolve(__dirname, '../core/src/runtime/on-demand.ts'),
	},
	{
		find: '@inth/sdk/runtime/save-preload',
		replacement: resolve(__dirname, '../core/src/runtime/save-preload.ts'),
	},
	{
		find: '@inth/sdk/runtime/script-server-start',
		replacement: resolve(
			__dirname,
			'../core/src/runtime/script-server-start.ts'
		),
	},
	{
		find: '@inth/sdk/runtime/page-globals',
		replacement: resolve(__dirname, '../core/src/libs/page-globals.ts'),
	},
	{
		find: '@inth/sdk/runtime/stand-in-kernel',
		replacement: resolve(__dirname, '../core/src/runtime/stand-in-kernel.ts'),
	},
	{
		find: '@inth/sdk/runtime/storage-for',
		replacement: resolve(__dirname, '../core/src/libs/storage-for.ts'),
	},
	{
		find: '@inth/sdk/runtime',
		replacement: resolve(__dirname, '../core/src/runtime/index.ts'),
	},
	{
		find: '@inth/sdk/modules/iframe-blocker',
		replacement: resolve(
			__dirname,
			'../core/src/modules/iframe-blocker/index.ts'
		),
	},
	{
		find: '@inth/sdk/modules/network-blocker',
		replacement: resolve(
			__dirname,
			'../core/src/modules/network-blocker/index.ts'
		),
	},
	{
		find: '@inth/sdk/modules/network-hold',
		replacement: resolve(
			__dirname,
			'../core/src/modules/network-blocker/hold.ts'
		),
	},
	{
		find: '@inth/sdk/modules/persistence',
		replacement: resolve(__dirname, '../core/src/modules/persistence/index.ts'),
	},
	{
		find: '@inth/sdk/modules/clear-on-revocation',
		replacement: resolve(
			__dirname,
			'../core/src/modules/clear-on-revocation/index.ts'
		),
	},
	{
		find: '@inth/sdk/modules/script-loader',
		replacement: resolve(
			__dirname,
			'../core/src/modules/script-loader/index.ts'
		),
	},
	{
		find: '@inth/sdk/modules/window-debug',
		replacement: resolve(
			__dirname,
			'../core/src/modules/window-debug/index.ts'
		),
	},
	{
		find: '@inth/sdk/preference-draft',
		replacement: resolve(__dirname, '../core/src/preference-draft/index.ts'),
	},
	{
		find: '@inth/sdk/server',
		replacement: resolve(__dirname, '../core/src/server/index.ts'),
	},
	// The deferred root's subpaths, before their prefixes.
	{
		find: '@inth/sdk/surface-actions/early-commit',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/early-commit.ts'
		),
	},
	{
		find: '@inth/sdk/surface-actions/instant-commit',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/instant-commit.ts'
		),
	},
	{
		find: '@inth/sdk/iab-support',
		replacement: resolve(__dirname, '../core/src/iab-support.ts'),
	},
	{
		find: '@inth/sdk/surface-actions/plain-scripts',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/plain-scripts.ts'
		),
	},
	{
		find: '@inth/sdk/surface-actions',
		replacement: resolve(__dirname, '../core/src/surface-actions/index.ts'),
	},
	// Before the bare specifier: Vite matches string aliases by prefix, so
	// `@inth/sdk/iab` alone would rewrite `@inth/sdk/iab/headless` into a path that
	// does not exist.
	{
		find: '@inth/sdk/iab/headless',
		replacement: resolve(__dirname, '../iab/src/headless.ts'),
	},
	{
		find: '@inth/sdk/iab/gpp',
		replacement: resolve(__dirname, '../iab/src/gpp.ts'),
	},
	{
		find: '@inth/sdk/iab',
		replacement: resolve(__dirname, '../iab/src/index.ts'),
	},
	{
		find: '@inth/sdk/schema/types',
		replacement: resolve(__dirname, '../schema/src/types.ts'),
	},
	{
		find: '@inth/sdk/schema/config',
		replacement: resolve(__dirname, '../schema/src/config/index.ts'),
	},
	{
		find: '@inth/sdk/schema/canonical-order',
		replacement: resolve(__dirname, '../schema/src/shared/canonical-order.ts'),
	},
	{
		find: '@inth/sdk/schema',
		replacement: resolve(__dirname, '../schema/src/index.ts'),
	},
	{
		find: '@inth/sdk/engine',
		replacement: resolve(__dirname, '../core/src/index.ts'),
	},
	{
		find: '~',
		replacement: resolve(__dirname, '../core/src'),
	},
];

const SSR_TEST_GLOB = 'src/**/*.ssr.test.ts';
const BROWSER_TEST_GLOB = 'src/**/*.browser.test.ts';

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			coverage: {
				exclude: ['.svelte-kit/**'],
				// Coverage ratchet: floors below current coverage so regressions
				// fail CI. Raise as coverage improves; never lower.
				thresholds: {
					branches: 30,

					functions: 45,
					lines: 50,
					statements: 50,
				},
			},
			projects: [
				{
					oxc: { exclude: [tracingRecipePath] },
					plugins: [
						svelte(),
						privateSdkNames(import.meta.dirname),
						{
							enforce: 'pre',
							name: 'tracing-recipe-without-sveltekit-sync',
							transform(code, id) {
								if (id === tracingRecipePath) {
									// Kit's generated $app/tsconfig is absent in package CI.
									return transformWithEsbuild(code, id, { tsconfigRaw: '{}' });
								}
							},
						},
					],
					resolve: {
						alias: [
							// The package's `imports` map, by the build each project runs.
							{
								find: '#server-root',
								replacement: resolve(
									__dirname,
									'src/lib/deferred/server-root-browser.ts'
								),
							},
							...workspaceAliases,
						],
						conditions: ['browser'],
					},
					test: {
						environment: 'jsdom',
						exclude: [SSR_TEST_GLOB, BROWSER_TEST_GLOB],
						include: [
							'src/**/*.test.ts',
							'src/**/*.test.svelte.ts',
							'src/**/*.spec.ts',
							'src/**/*.spec.svelte.ts',
						],
						name: 'client',
						setupFiles: ['./src/__tests__/setup.ts'],
					},
				},
				{
					plugins: [svelte(), privateSdkNames(import.meta.dirname)],
					resolve: {
						alias: [
							{
								find: '#server-root',
								replacement: resolve(
									__dirname,
									'src/lib/deferred/server-root.ts'
								),
							},
							...workspaceAliases,
						],
						conditions: ['svelte', 'node'],
					},
					test: {
						environment: 'node',
						include: [SSR_TEST_GLOB],
						name: 'ssr',
					},
				},
				{
					optimizeDeps: {
						// What the surfaces import through the aliased core source.
						// Left to discovery, Vite pre-bundles them on first sight
						// mid-run and reloads the page, which leaves the test with
						// two Svelte runtimes; a cold CI cache hits this every run.
						include: ['base-x', 'esm-env', 'valibot'],
					},
					plugins: [svelte(), privateSdkNames(import.meta.dirname)],
					resolve: {
						alias: [
							{
								find: '#server-root',
								replacement: resolve(
									__dirname,
									'src/lib/deferred/server-root-browser.ts'
								),
							},
							...workspaceAliases,
						],
						conditions: ['browser'],
					},
					test: {
						browser: {
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }],
							provider: playwright(),
						},
						include: [BROWSER_TEST_GLOB],
						name: 'browser',
					},
				},
			],
		},
	})
);
