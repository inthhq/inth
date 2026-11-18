import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { baseConfig } from '@inth/vitest-config/base';
import vue from '@vitejs/plugin-vue';
import { defineConfig, mergeConfig } from 'vitest/config';

import { privateSdkNames } from '../shared/private-sdk-names';

const assignInOrder = Object.assign;

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
		plugins: [vue(), privateSdkNames(import.meta.dirname)],
		resolve: {
			alias: assignInOrder(
				{},
				{ '~': resolve(__dirname, './src') },
				{ '@inth/sdk/build': resolve(__dirname, '../core/src/build.ts') },
				{ '#imports': resolve(__dirname, './src/runtime/vue/stubs.ts') },
				{
					'#inth/composables': resolve(
						__dirname,
						'./src/runtime/composables/index.ts'
					),
				},
				{
					'#@inth/sdk/server-app-config': resolve(
						__dirname,
						'./src/__tests__/server-app-config.ts'
					),
				},
				{
					'#@inth/sdk/build-options': resolve(
						__dirname,
						'./src/__tests__/build-options-virtual.ts'
					),
				},
				{
					'#inth/banner-preload-files': resolve(
						__dirname,
						'./src/__tests__/banner-preload-files-virtual.ts'
					),
				},
				{
					'#inth/legacy-project-url-env': resolve(
						__dirname,
						'./src/__tests__/legacy-project-url-env-virtual.ts'
					),
				},
				{
					'#@inth/sdk/server-manifest-snapshot': resolve(
						__dirname,
						'./src/__tests__/manifest-snapshot.ts'
					),
					'#inth/client-manifest-snapshot': resolve(
						__dirname,
						'./src/__tests__/manifest-snapshot.ts'
					),
					'#inth/manifest-snapshot': resolve(
						__dirname,
						'./src/__tests__/manifest-snapshot.ts'
					),
				},
				{
					'@inth/sdk/generated': resolve(
						__dirname,
						'./src/__tests__/generated.ts'
					),
					'@inth/sdk/modes': resolve(__dirname, '../core/src/modes.ts'),
					'@inth/sdk/runtime/client-mode': resolve(
						__dirname,
						'../core/src/runtime/client-mode.ts'
					),
					'@inth/sdk/testing': resolve(__dirname, '../core/src/testing.ts'),
				},
				{
					'@inth/sdk/modules/clear-on-revocation': resolve(
						__dirname,
						'../core/src/modules/clear-on-revocation/index.ts'
					),
					'@inth/sdk/modules/script-loader': resolve(
						__dirname,
						'../core/src/modules/script-loader/index.ts'
					),
				},
				{
					'@inth/sdk/modules/network-blocker': resolve(
						__dirname,
						'../core/src/modules/network-blocker/index.ts'
					),
				},
				{
					'@inth/sdk/modules/network-hold': resolve(
						__dirname,
						'../core/src/modules/network-blocker/hold.ts'
					),
				},
				{
					'@inth/sdk/modules/iframe-blocker': resolve(
						__dirname,
						'../core/src/modules/iframe-blocker/index.ts'
					),
				},
				{
					'@inth/sdk/modules/persistence': resolve(
						__dirname,
						'../core/src/modules/persistence/index.ts'
					),
				},
				{
					'@inth/sdk/modules/window-debug': resolve(
						__dirname,
						'../core/src/modules/window-debug/index.ts'
					),
				},
				{
					'@inth/sdk/consent-record': resolve(
						__dirname,
						'../core/src/consent-record/index.ts'
					),
				},
				{
					'@inth/sdk/transports/manifest-cache': resolve(
						__dirname,
						'../core/src/transports/manifest-cache.ts'
					),
				},
				{
					'@inth/sdk/transports/manifest-browser': resolve(
						__dirname,
						'../core/src/transports/manifest-browser.ts'
					),
				},
				{
					'@inth/sdk/transports/manifest': resolve(
						__dirname,
						'../core/src/transports/manifest.ts'
					),
				},
				{
					'@inth/sdk/server': resolve(__dirname, '../core/src/server/index.ts'),
				},
				{
					'@inth/sdk/surface-actions/early-commit': resolve(
						__dirname,
						'../core/src/surface-actions/early-commit.ts'
					),
					'@inth/sdk/surface-actions/instant-commit': resolve(
						__dirname,
						'../core/src/surface-actions/instant-commit.ts'
					),
				},
				{
					'@inth/sdk/iab-support': resolve(
						__dirname,
						'../core/src/iab-support.ts'
					),
				},
				{
					'@inth/sdk/surface-actions': resolve(
						__dirname,
						'../core/src/surface-actions/index.ts'
					),
				},
				{
					'@inth/sdk/runtime/controls': resolve(
						__dirname,
						'../core/src/runtime/controls.ts'
					),
					'@inth/sdk/runtime/on-demand': resolve(
						__dirname,
						'../core/src/runtime/on-demand.ts'
					),
					'@inth/sdk/runtime/provider': resolve(
						__dirname,
						'../core/src/runtime/provider.ts'
					),
					'@inth/sdk/runtime/script-server-start': resolve(
						__dirname,
						'../core/src/runtime/script-server-start.ts'
					),
				},
				{
					'@inth/sdk/events': resolve(__dirname, '../core/src/events.ts'),
				},
				{
					'@inth/sdk/preference-draft': resolve(
						__dirname,
						'../core/src/preference-draft/index.ts'
					),
				},
				{
					'@inth/sdk/runtime': resolve(
						__dirname,
						'../core/src/runtime/index.ts'
					),
				},
				{
					'@inth/sdk/transports': resolve(
						__dirname,
						'../core/src/transports/index.ts'
					),
				},
				{ '@inth/sdk/engine': resolve(__dirname, '../core/src/index.ts') },
				{
					'@inth/sdk/translations/all': resolve(
						__dirname,
						'../translations/src/all.ts'
					),
				},
				{
					'@inth/sdk/translations/en': resolve(
						__dirname,
						'../translations/src/translations/en.ts'
					),
				},
				translationLanguages,
				{
					'@inth/sdk/translations': resolve(
						__dirname,
						'../translations/src/index.ts'
					),
				},
				{
					'@inth/conformance': resolve(
						__dirname,
						'../../../internals/conformance/src/index.ts'
					),
				},
				{
					'@inth/sdk/schema/types': resolve(
						__dirname,
						'../schema/src/types.ts'
					),
				},
				{
					'@inth/sdk/schema/config': resolve(
						__dirname,
						'../schema/src/config/index.ts'
					),
				},
				{
					'@inth/sdk/schema/canonical-order': resolve(
						__dirname,
						'../schema/src/shared/canonical-order.ts'
					),
				},
				{ '@inth/sdk/schema': resolve(__dirname, '../schema/src/index.ts') }
			),
		},
		test: {
			coverage: {
				exclude: ['playground/**'],
				// Coverage ratchet: floors below current coverage so regressions
				// fail CI. Raise as coverage improves; never lower.
				// Statements/functions/branches currently measure below 30%
				// (untested files in the include glob inflate the denominator),
				// so only lines is enforced for now.
				thresholds: {
					lines: 45,
				},
			},
			environment: 'jsdom',
			include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
		},
	})
);
