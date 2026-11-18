import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/react-vite';
import stylex from '@stylexjs/unplugin/vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { mergeConfig } from 'vite';

const storybookDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = (...segments: string[]) =>
	path.resolve(storybookDir, '../../..', ...segments);
const ui = (...segments: string[]) =>
	workspace('packages/sdk/ui/src', ...segments);

const config: StorybookConfig = {
	addons: ['@storybook/addon-a11y'],
	framework: '@storybook/react-vite',
	stories: ['../src/**/*.stories.@(ts|tsx)'],
	// oxlint-disable-next-line require-await -- Preserve sequential execution and callback compatibility.
	viteFinal: async (configLocal) =>
		mergeConfig(configLocal, {
			esbuild: {
				jsx: 'automatic',
				jsxImportSource: 'react',
			},
			optimizeDeps: {
				include: [
					'react',
					'react-dom',
					'react/jsx-runtime',
					'react/jsx-dev-runtime',
					'react-dom/client',
				],
			},
			// The docs' class-name recipes (src/docs-recipes/class-names).
			plugins: [
				vanillaExtractPlugin(),
				// Append StyleX's rules to the preview entry's CSS, which every
				// story loads, rather than whichever CSS asset comes first.
				stylex({
					cssInjectionTarget: (fileName) => fileName.includes('iframe'),
				}),
			],
			resolve: {
				alias: [
					{
						find: /^@c15t\/conformance\/(?<capture1>.*)$/u,
						replacement: path.resolve(
							storybookDir,
							'../../../internals/conformance/src/$1'
						),
					},
					{
						find: '@inth/react/primitives',
						replacement: workspace('packages/sdk/react/src/primitives.ts'),
					},
					{
						find: /^@inth\/react$/u,
						replacement: workspace('packages/sdk/react/src/index.ts'),
					},
					// `@inth/react`'s index reaches its provider and banner through the
					// package's `imports` map, which Vite resolves to `dist`: a second
					// copy of the package next to the sources above, whose surfaces
					// would then find no kernel in context.
					{
						find: /^#consent-provider$/u,
						replacement: workspace('packages/sdk/react/src/provider.tsx'),
					},
					{
						find: /^#consent-banner$/u,
						replacement: workspace(
							'packages/sdk/react/src/components/prompt/index.ts'
						),
					},
					{
						find: /^@inth\/sdk\/iab$/u,
						replacement: workspace('packages/sdk/iab/src/index.ts'),
					},
					{
						find: /^@inth\/sdk\/schema\/types$/u,
						replacement: workspace('packages/sdk/schema/src/types.ts'),
					},
					{
						find: /^@inth\/sdk\/schema$/u,
						replacement: workspace('packages/sdk/schema/src/index.ts'),
					},
					// Docs recipes import the umbrella paths readers install.
					{
						find: /^@inth\/react\/headless$/u,
						replacement: workspace('packages/sdk/react/src/headless.ts'),
					},
					{
						find: /^@inth\/react$/u,
						replacement: workspace('packages/sdk/react/src/index.ts'),
					},
					{
						find: /^c15t$/u,
						replacement: workspace('packages/sdk/core/src/index.ts'),
					},
					{
						find: /^@iabtechlabtcf\/core$/u,
						replacement: workspace(
							'packages/sdk/iab/node_modules/@iabtechlabtcf/core'
						),
					},
					{
						find: /^~\/(?<capture1>.*)$/u,
						replacement: workspace('packages/sdk/react/src/$1'),
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
						find: /^@inth\/sdk\/ui\/styles\/primitives\/(.+)\.module\.js$/u,
						replacement: ui('styles', 'primitives', '$1.module.css'),
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
						find: /^@inth\/sdk\/ui\/utils$/u,
						replacement: ui('utils', 'index.ts'),
					},
					{
						// oxlint-disable-next-line prefer-named-capture-group -- Preserve declaration order, interface shape, and public compatibility.
						find: /^@inth\/sdk\/ui\/utils\/(.+)$/u,
						replacement: ui('utils', '$1.ts'),
					},
					{
						find: '@inth/sdk/translations/all',
						replacement: workspace('packages/sdk/translations/src/all.ts'),
					},
					{
						find: /^@inth\/sdk\/translations$/u,
						replacement: workspace('packages/sdk/translations/src/index.ts'),
					},
				],
			},
		}),
};

export default config;
