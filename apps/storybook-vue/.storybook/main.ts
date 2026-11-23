import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { StorybookConfig } from '@storybook/vue3-vite';
import { mergeConfig } from 'vite';

const storybookDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(storybookDir, '../../..');
const require = createRequire(import.meta.url);
const vuePackage = (...segments: string[]) =>
	path.resolve(repoRoot, 'packages/sdk/vue/src', ...segments);
const core = (...segments: string[]) =>
	path.resolve(repoRoot, 'packages/sdk/core/src', ...segments);
const ui = (...segments: string[]) =>
	path.resolve(repoRoot, 'packages/sdk/ui/src', ...segments);

const config: StorybookConfig = {
	addons: ['@storybook/addon-a11y'],
	framework: '@storybook/vue3-vite',
	stories: ['../src/**/*.stories.@(ts|tsx)'],
	viteFinal: async (configLocal) => {
		const vuePluginPath = require.resolve('@vitejs/plugin-vue', {
			paths: [path.resolve(repoRoot, 'packages/sdk/vue')],
		});
		const { default: vue } = await import(pathToFileURL(vuePluginPath).href);

		return mergeConfig(configLocal, {
			plugins: [vue()],
			resolve: {
				alias: [
					{
						find: /^#imports$/u,
						replacement: vuePackage('runtime', 'vue', 'stubs.ts'),
					},
					{
						find: /^#inth\/composables$/u,
						replacement: vuePackage('runtime', 'composables', 'index.ts'),
					},
					{
						find: /^inth\/v3\/modules\/script-loader$/u,
						replacement: core('v3', 'modules', 'script-loader', 'index.ts'),
					},
					{
						find: /^inth\/v3\/modules\/network-blocker$/u,
						replacement: core('v3', 'modules', 'network-blocker', 'index.ts'),
					},
					{
						find: /^inth\/v3\/modules\/iframe-blocker$/u,
						replacement: core('v3', 'modules', 'iframe-blocker', 'index.ts'),
					},
					{
						find: /^inth\/v3\/modules\/persistence$/u,
						replacement: core('v3', 'modules', 'persistence', 'index.ts'),
					},
					{
						find: /^inth\/v3\/consent-record$/u,
						replacement: core('v3', 'consent-record', 'index.ts'),
					},
					{
						find: /^inth\/v3$/u,
						replacement: core('v3', 'index.ts'),
					},
					{
						find: /^@inth\/conformance\/(?<capture1>.*)$/u,
						replacement: path.resolve(repoRoot, 'internals/conformance/src/$1'),
					},
					{
						find: /^@inth\/vue$/u,
						replacement: vuePackage('index.ts'),
					},
					// Docs recipes import the umbrella paths readers install.
					{
						find: /^@inth\/vue\/vue-plugin$/u,
						replacement: vuePackage('index.ts'),
					},
					{
						find: /^@inth\/vue\/runtime\/components\/consent-banner\.vue$/u,
						replacement: vuePackage('runtime', 'components', 'prompt', 'prompt.vue'),
					},
					{
						find: /^@inth\/vue\/runtime\/components\/consent-manager\.vue$/u,
						replacement: vuePackage('runtime', 'components', 'dialog', 'manager.vue'),
					},
					// @inth/sdk/ui — resolve all subpath imports to source
					{
						find: /^@inth\/sdk\/ui\/primitives\/data-state$/u,
						replacement: ui('primitives', 'data-state.ts'),
					},
					{
						// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
						find: /^@inth\/sdk\/ui\/primitives\/(.+)$/u,
						replacement: ui('primitives', '$1', 'index.ts'),
					},
					{
						find: /^@inth\/sdk\/ui\/primitives$/u,
						replacement: ui('primitives', 'index.ts'),
					},
					{
						// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
						find: /^@inth\/sdk\/ui\/styles\/primitives\/(.+)$/u,
						replacement: ui('styles', 'primitives', '$1.ts'),
					},
					{
						find: /^@inth\/sdk\/ui\/styles\/primitives$/u,
						replacement: ui('styles', 'primitives', 'index.ts'),
					},
					{
						find: /^@inth\/sdk\/ui\/theme$/u,
						replacement: ui('theme', 'index.ts'),
					},
					{
						// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
						find: /^@inth\/sdk\/ui\/utils\/(.+)$/u,
						replacement: ui('utils', '$1.ts'),
					},
					{
						find: /^@inth\/sdk\/translations$/u,
						replacement: path.resolve(
							repoRoot,
							'packages/sdk/translations/src/index.ts'
						),
					},
					{
						find: /^@inth\/sdk\/schema\/types$/u,
						replacement: path.resolve(
							repoRoot,
							'packages/sdk/schema/src/types.ts'
						),
					},
					{
						find: /^@inth\/sdk\/schema\/config$/u,
						replacement: path.resolve(
							repoRoot,
							'packages/sdk/schema/src/config/index.ts'
						),
					},
					{
						find: /^@inth\/sdk\/schema$/u,
						replacement: path.resolve(
							repoRoot,
							'packages/sdk/schema/src/index.ts'
						),
					},
				],
			},
		});
	},
};

export default config;
