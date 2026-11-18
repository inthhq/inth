import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { baseConfig } from '@inth/vitest-config/base';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import { privateSdkNames } from '../shared/private-sdk-names';

/**
 * `@inth/sdk/translations/<lang>` for every language module, ahead of the
 * package-root alias, which would otherwise swallow them.
 */
const translationLanguages = Object.fromEntries(
	readdirSync(resolve(__dirname, '../translations/src/languages'))
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.map((file) => [
			`@inth/sdk/translations/${file.slice(0, -'.ts'.length)}`,
			resolve(__dirname, '../translations/src/languages', file),
		])
);

export default mergeConfig(
	baseConfig,
	defineConfig({
		optimizeDeps: {
			include: [
				'react',
				'react-dom/client',
				'react-dom/server',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				'vitest-browser-react',
			],
		},
		plugins: [react(), privateSdkNames(import.meta.dirname)],
		resolve: {
			// oxlint-disable-next-line sort-keys -- Vite resolves aliases in declaration order, so subpaths must precede package roots.
			alias: {
				'~': resolve(__dirname, './src'),
				// The browser build; the node project overrides it with the
				// server's, which imports the engine statically.
				'#engine-now': resolve(__dirname, './src/engine-now-browser.ts'),
				'@inth/nextjs/generated-manifest': resolve(
					__dirname,
					'./src/generated-manifest.ts'
				),
				'@inth/nextjs/user-config': resolve(__dirname, './src/user-config.ts'),
				'@inth/sdk/modes': resolve(__dirname, '../core/src/modes.ts'),
				'@inth/sdk/testing': resolve(__dirname, '../core/src/testing.ts'),
				'@inth/sdk/runtime/client-mode': resolve(
					__dirname,
					'../core/src/runtime/client-mode.ts'
				),
				'@inth/react/components/consent-banner': resolve(
					__dirname,
					'../react/dist/components/prompt/index.js'
				),
				'@inth/react/consent-dialog': resolve(
					__dirname,
					'../react/dist/panel.js'
				),
				'@inth/react/components/consent-dialog-trigger': resolve(
					__dirname,
					'../react/dist/components/panel-trigger/index.js'
				),
				'@inth/react/components/consent-gate': resolve(
					__dirname,
					'../react/dist/components/consent-gate/index.js'
				),
				'@inth/react/consent-widget': resolve(
					__dirname,
					'../react/dist/preferences.js'
				),
				'@inth/react/draft': resolve(__dirname, '../react/dist/draft.js'),
				'@inth/react/theme': resolve(
					__dirname,
					'../react/dist/index-parts/theme.js'
				),
				'@inth/react/devtools': resolve(__dirname, '../react/dist/devtools.js'),
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
				'@inth/sdk/transports/hosted-factory': resolve(
					__dirname,
					'../core/src/transports/hosted-factory.ts'
				),
				'@inth/sdk/runtime/deferred-boot': resolve(
					__dirname,
					'../core/src/runtime/deferred-boot.ts'
				),
				'@inth/sdk/runtime/deferred-snapshot': resolve(
					__dirname,
					'../core/src/runtime/deferred-snapshot.ts'
				),
				'@inth/sdk/transports/manifest-cache': resolve(
					__dirname,
					'../core/src/transports/manifest-cache.ts'
				),
				'@inth/sdk/transports/manifest-browser': resolve(
					__dirname,
					'../core/src/transports/manifest-browser.ts'
				),
				'@inth/sdk/transports/manifest': resolve(
					__dirname,
					'../core/src/transports/manifest.ts'
				),
				'@inth/sdk/transports': resolve(
					__dirname,
					'../core/src/transports/index.ts'
				),
				'@inth/sdk/events': resolve(__dirname, '../core/src/events.ts'),
				'@inth/sdk/server': resolve(__dirname, '../core/src/server/index.ts'),
				'@inth/sdk/build': resolve(__dirname, '../core/src/build.ts'),
				'@inth/sdk/static': resolve(__dirname, '../core/src/static.ts'),
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
				'@inth/sdk/iab-support': resolve(
					__dirname,
					'../core/src/iab-support.ts'
				),
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
				'@inth/sdk/runtime/page-globals': resolve(
					__dirname,
					'../core/src/runtime/page-globals.ts'
				),
				'@inth/sdk/runtime/priority-images': resolve(
					__dirname,
					'../core/src/runtime/priority-images.ts'
				),
				'@inth/sdk/runtime': resolve(__dirname, '../core/src/runtime/index.ts'),
				'@inth/sdk/engine': resolve(__dirname, '../core/src/index.ts'),
				'@inth/react/context': resolve(__dirname, '../react/dist/context.js'),
				'@inth/react/gpp': resolve(__dirname, '../react/dist/gpp.js'),
				'@inth/react/iab': resolve(__dirname, '../react/dist/iab.js'),
				'@inth/react/provider': resolve(__dirname, '../react/dist/provider.js'),
				'@inth/react/deferred/engine': resolve(
					__dirname,
					'../react/dist/deferred/engine.js'
				),
				'@inth/react/deferred': resolve(
					__dirname,
					'../react/dist/deferred/index.js'
				),
				'@inth/react/hooks': resolve(__dirname, '../react/dist/hooks.js'),
				'@inth/react/module-hooks': resolve(
					__dirname,
					'../react/dist/module-hooks.js'
				),
				'@inth/react/server': resolve(
					__dirname,
					'../react/dist/server/index.js'
				),
				'@inth/react/headless': resolve(__dirname, '../react/dist/headless.js'),
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
				...translationLanguages,
				'@inth/sdk/translations': resolve(
					__dirname,
					'../translations/src/index.ts'
				),
				'@inth/sdk/schema/types': resolve(__dirname, '../schema/src/types.ts'),
				'@inth/sdk/schema/canonical-order': resolve(
					__dirname,
					'../schema/src/shared/canonical-order.ts'
				),
				'@inth/sdk/schema': resolve(__dirname, '../schema/src/index.ts'),
			},
		},
		test: {
			coverage: {
				exclude: ['**/__tests__/**'],
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
							'src/__tests__/build.test.ts',
							'src/__tests__/config.test.ts',
							'src/__tests__/defer-server.test.tsx',
							'src/__tests__/proxy.test.ts',
							'src/__tests__/root-engine-preload.test.tsx',
							'src/__tests__/root-server-start.test.tsx',
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
						exclude: [
							'src/__tests__/build.test.ts',
							'src/__tests__/config.test.ts',
							'src/__tests__/defer-server.test.tsx',
							'src/__tests__/proxy.test.ts',
							'src/__tests__/root-engine-preload.test.tsx',
							'src/__tests__/root-server-start.test.tsx',
							'src/__tests__/root-sync-render.test.tsx',
						],
						include: [
							'src/**/*.test.tsx',
							'src/**/*.test.ts',
							'src/**/*.spec.tsx',
							'src/**/*.spec.ts',
						],
						name: 'browser',
						// `ConsentRoot` loads its engine with `import()`; tests that
						// render it synchronously need it loaded first.
						setupFiles: ['./src/__tests__/setup-browser.ts'],
					},
				},
			],
		},
	})
);
