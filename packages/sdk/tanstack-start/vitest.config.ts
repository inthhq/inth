import { resolve } from 'node:path';

import { baseConfig } from '@inth/vitest-config/base';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import { privateSdkNames } from '../shared/private-sdk-names';

// oxlint-disable-next-line sort-keys -- Vite resolves aliases in declaration order, so subpaths must precede package roots.
const alias = {
	'~': resolve(__dirname, './src'),
	// The browser build; the node project overrides it with the server's,
	// which imports the engine statically.
	'#engine-now': resolve(__dirname, './src/engine-now-browser.ts'),
	'@inth/sdk/modules/clear-on-revocation': resolve(
		__dirname,
		'../core/src/modules/clear-on-revocation/index.ts'
	),
	'@inth/sdk/modules/script-loader': resolve(
		__dirname,
		'../core/src/modules/script-loader/index.ts'
	),
	'@inth/sdk/modules/network-blocker': resolve(
		__dirname,
		'../core/src/modules/network-blocker/index.ts'
	),
	'@inth/sdk/modules/network-hold': resolve(
		__dirname,
		'../core/src/modules/network-blocker/hold.ts'
	),
	'@inth/sdk/modules/iframe-blocker': resolve(
		__dirname,
		'../core/src/modules/iframe-blocker/index.ts'
	),
	'@inth/sdk/modules/persistence': resolve(
		__dirname,
		'../core/src/modules/persistence/index.ts'
	),
	'@inth/sdk/modules/window-debug': resolve(
		__dirname,
		'../core/src/modules/window-debug/index.ts'
	),
	'@inth/sdk/runtime/storage-for': resolve(
		__dirname,
		'../core/src/libs/storage-for.ts'
	),
	'@inth/sdk/runtime/deferred-boot': resolve(
		__dirname,
		'../core/src/runtime/deferred-boot.ts'
	),
	'@inth/sdk/runtime/stand-in-kernel': resolve(
		__dirname,
		'../core/src/runtime/stand-in-kernel.ts'
	),
	'@inth/sdk/runtime/deferred-snapshot': resolve(
		__dirname,
		'../core/src/runtime/deferred-snapshot.ts'
	),
	'@inth/sdk/surface-actions/early-commit': resolve(
		__dirname,
		'../core/src/surface-actions/early-commit.ts'
	),
	'@inth/sdk/surface-actions/instant-commit': resolve(
		__dirname,
		'../core/src/surface-actions/instant-commit.ts'
	),
	'@inth/sdk/surface-actions/plain-scripts': resolve(
		__dirname,
		'../core/src/surface-actions/plain-scripts.ts'
	),
	'@inth/sdk/transports/hosted-factory': resolve(
		__dirname,
		'../core/src/transports/hosted-factory.ts'
	),
	'@inth/sdk/transports/manifest-browser': resolve(
		__dirname,
		'../core/src/transports/manifest-browser.ts'
	),
	'@inth/sdk/transports/manifest-cache': resolve(
		__dirname,
		'../core/src/transports/manifest-cache.ts'
	),
	'@inth/sdk/transports/manifest': resolve(
		__dirname,
		'../core/src/transports/manifest.ts'
	),
	'@inth/sdk/transports': resolve(__dirname, '../core/src/transports/index.ts'),
	'@inth/sdk/consent-record': resolve(
		__dirname,
		'../core/src/consent-record/index.ts'
	),
	'@inth/sdk/events': resolve(__dirname, '../core/src/events.ts'),
	'@inth/sdk/server': resolve(__dirname, '../core/src/server/index.ts'),
	'@inth/sdk/static': resolve(__dirname, '../core/src/static.ts'),
	'@inth/sdk/build': resolve(__dirname, '../core/src/build.ts'),
	'@inth/sdk/iab-support': resolve(__dirname, '../core/src/iab-support.ts'),
	'@inth/sdk/surface-actions': resolve(
		__dirname,
		'../core/src/surface-actions/index.ts'
	),
	'@inth/sdk/runtime/controls': resolve(
		__dirname,
		'../core/src/runtime/controls.ts'
	),
	'@inth/sdk/preference-draft': resolve(
		__dirname,
		'../core/src/preference-draft/index.ts'
	),
	'@inth/sdk/runtime/provider': resolve(
		__dirname,
		'../core/src/runtime/provider.ts'
	),
	'@inth/sdk/runtime/script-loader-preload': resolve(
		__dirname,
		'../core/src/runtime/script-loader-preload.ts'
	),
	'@inth/sdk/runtime/script-server-start': resolve(
		__dirname,
		'../core/src/runtime/script-server-start.ts'
	),
	'@inth/sdk/runtime/streamed-init': resolve(
		__dirname,
		'../core/src/runtime/streamed-init.ts'
	),
	'@inth/sdk/runtime/client-mode': resolve(
		__dirname,
		'../core/src/runtime/client-mode.ts'
	),
	'@inth/sdk/runtime/page-globals': resolve(
		__dirname,
		'../core/src/libs/page-globals.ts'
	),
	'@inth/sdk/runtime': resolve(__dirname, '../core/src/runtime/index.ts'),
	'@inth/sdk/generated': resolve(__dirname, '../core/src/generated.ts'),
	'@inth/sdk/modes': resolve(__dirname, '../core/src/modes.ts'),
	'@inth/sdk/testing': resolve(__dirname, '../core/src/testing.ts'),
	'@inth/sdk/engine': resolve(__dirname, '../core/src/index.ts'),
	'@inth/react/deferred/engine': resolve(
		__dirname,
		'../react/dist/deferred/engine.js'
	),
	'@inth/react/deferred': resolve(__dirname, '../react/dist/deferred/index.js'),
	'@inth/react/context': resolve(__dirname, '../react/dist/context.js'),
	'@inth/react/gpp': resolve(__dirname, '../react/dist/gpp.js'),
	'@inth/react/iab': resolve(__dirname, '../react/dist/iab.js'),
	'@inth/react/provider': resolve(__dirname, '../react/dist/provider.js'),
	'@inth/react/hooks': resolve(__dirname, '../react/dist/hooks.js'),
	'@inth/react/module-hooks': resolve(
		__dirname,
		'../react/dist/module-hooks.js'
	),
	'@inth/react/server': resolve(__dirname, '../react/dist/server/index.js'),
	'@inth/react/headless': resolve(__dirname, '../react/dist/headless.js'),
	'@inth/react/devtools': resolve(__dirname, '../react/dist/devtools.js'),
	'@inth/react/components/consent-dialog-link': resolve(
		__dirname,
		'../react/dist/components/panel-link/index.js'
	),
	'@inth/react/postcss-tailwind3': resolve(
		__dirname,
		'../react/dist/postcss-tailwind3.js'
	),
	'@inth/react': resolve(__dirname, '../react/dist/index.js'),
	'@inth/sdk/translations/all': resolve(
		__dirname,
		'../translations/src/all.ts'
	),
	'@inth/sdk/translations/en': resolve(
		__dirname,
		'../translations/src/translations/en.ts'
	),
	'@inth/sdk/translations': resolve(__dirname, '../translations/src/index.ts'),
	'@inth/sdk/schema/geo': resolve(
		__dirname,
		'../schema/src/shared/geo-headers.ts'
	),
	'@inth/sdk/schema/types': resolve(__dirname, '../schema/src/types.ts'),
	'@inth/sdk/schema/canonical-order': resolve(
		__dirname,
		'../schema/src/shared/canonical-order.ts'
	),
	'@inth/sdk/schema': resolve(__dirname, '../schema/src/index.ts'),
};

/** `vitest run` is run mode; a bare `vitest` or `--watch` is watch mode. */
const isVitestWatchMode = function isVitestWatchMode(): boolean {
	const args = process.argv.slice(2);
	if (args.includes('--watch')) {
		return true;
	}
	return !(args.includes('run') || args.includes('--run'));
};

export default mergeConfig(
	baseConfig,
	defineConfig({
		optimizeDeps: {
			// Build tooling reached through rslib.config.ts / shared rslib-utils
			// is not a browser dependency. Left to discovery, Vite pre-bundles
			// it on first sight mid-run and reloads the page, which
			// vitest-browser-react does not survive on a cold CI cache.
			exclude: [
				'@rsbuild/plugin-react',
				'@rslib/core',
				'@rsdoctor/rspack-plugin',
				'@rsdoctor/core',
				'@rspack/resolver',
				'@rspack/resolver-binding-wasm32-wasi',
				// Server-only entries reached when coverage transforms server.ts
				// through the browser project. Pre-bundling them fails on Start's
				// `#tanstack-*-entry` package imports and, like the tooling above,
				// re-optimises mid-run.
				'@tanstack/react-start',
				'@tanstack/react-start/server',
				'@tanstack/react-start-server',
				'@tanstack/start-server-core',
			],
		},
		plugins: [react(), privateSdkNames(import.meta.dirname)],
		resolve: { alias },
		server: {
			// Sibling packages regenerate `src/version.ts` in their own prebuild
			// while these browser tests run against core source through the
			// aliases above. With a file watcher active that rewrite reloads a
			// test mid-run, which vitest-browser-react does not survive, so the
			// watcher is off for `vitest run` and left on for watch mode (the
			// `test:watch` scripts, or an explicit `--watch`).
			watch: isVitestWatchMode() ? undefined : null,
		},
		test: {
			coverage: {
				// Coverage ratchet: floors below current coverage so regressions
				// fail CI. Raise as coverage improves; never lower.
				thresholds: {
					branches: 40,
					functions: 50,
					lines: 45,
					statements: 45,
				},
			},
			projects: [
				{
					extends: true,
					resolve: {
						alias: {
							'#engine-now': resolve(__dirname, './src/engine-now.ts'),
						},
					},
					test: {
						environment: 'node',
						include: [
							'src/**/*.test.ts',
							'src/__tests__/root-sync-render.test.tsx',
						],
						name: 'node',
					},
				},
				{
					extends: true,
					test: {
						browser: {
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }],
							provider: playwright(),
						},
						exclude: ['src/__tests__/root-sync-render.test.tsx'],
						include: ['src/**/*.test.tsx'],
						name: 'browser',
						setupFiles: ['./src/__tests__/setup-browser.ts'],
					},
				},
			],
		},
	})
);
