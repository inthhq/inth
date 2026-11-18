// Angular templates need the Angular compiler, so tests compile through
// @analogjs/vite-plugin-angular under jsdom, zoneless like the package;
// `src/test-setup.ts` sets up the TestBed. Server rendering runs in the same
// process through `renderApplication` from @angular/platform-server.
//
// Toolchain: Angular and ng-packagr 22.2.x (ng-packagr emits partial
// compilation, which Angular 20 apps link), Analog 2.9.6 (2.9.x supports
// Angular 22 and Vite 8), Vite 8.1.3 as the rest of the repo. Versions are
// the newest that clear bunfig's three-day `minimumReleaseAge`.
//
// Workspace packages resolve to their source, as in @inth/svelte, so the
// conformance driver's imports of core internals (persistence writer
// preload, record codec) share module state with the runtime under test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import angular from '@analogjs/vite-plugin-angular';
import { baseConfig } from '@inth/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

import { privateSdkNames } from '../shared/private-sdk-names';

// Vite resolves a `@inth/sdk/ui` style subpath through its `style` condition to
// the CSS file, which tests load as an empty string, so every stock class
// would read `undefined`. Each subpath's `import` build holds the class
// map; tests resolve to it and see the classes the package renders.
const uiExports = (
	JSON.parse(
		readFileSync(resolve(__dirname, '../ui/package.json'), 'utf8')
	) as { exports: Record<string, string | { import?: string }> }
).exports;
const uiStyleAliases = Object.entries(uiExports).flatMap(([subpath, target]) =>
	subpath.startsWith('./styles/') &&
	typeof target === 'object' &&
	target.import?.endsWith('.js')
		? [
				{
					find: `@inth/sdk/ui/${subpath.slice(2)}`,
					replacement: resolve(__dirname, '../ui', target.import),
				},
			]
		: []
);
// The rest go through the `./styles/components/*` pattern.
uiStyleAliases.push({
	find: /^@inth\/sdk\/ui\/styles\/components\/(?<name>[a-z-]+)$/u,
	replacement: resolve(__dirname, '../ui/dist/styles/components/$1.js'),
});

const workspaceAliases = [
	...uiStyleAliases,
	{
		find: '@inth/sdk/build',
		replacement: resolve(__dirname, '../core/src/build.ts'),
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
		find: '@inth/sdk/transports/hosted-factory',
		replacement: resolve(__dirname, '../core/src/transports/hosted-factory.ts'),
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
		find: '@inth/sdk/runtime/deferred-boot',
		replacement: resolve(__dirname, '../core/src/runtime/deferred-boot.ts'),
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
		replacement: resolve(__dirname, '../core/src/runtime/page-globals.ts'),
	},
	{
		find: '@inth/sdk/runtime/priority-images',
		replacement: resolve(__dirname, '../core/src/runtime/priority-images.ts'),
	},
	{
		find: '@inth/sdk/runtime/storage-for',
		replacement: resolve(__dirname, '../core/src/runtime/storage-for.ts'),
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
		find: '@inth/sdk/surface-actions/plain-scripts',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/plain-scripts.ts'
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
		find: '@inth/sdk/surface-actions/stored-records',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/stored-records.ts'
		),
	},
	{
		find: '@inth/sdk/iab-support',
		replacement: resolve(__dirname, '../core/src/iab-support.ts'),
	},
	{
		find: '@inth/sdk/surface-state',
		replacement: resolve(__dirname, '../core/src/surface-state.ts'),
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
	// Secondary entry points import the primary by its package name.
	{
		find: /^@inth\/angular$/u,
		replacement: resolve(__dirname, 'src/public-api.ts'),
	},
	{
		find: /^@inth\/angular\/(?<entry>consent-dialog|consent-dialog-trigger|consent-gate|consent-root|consent-widget|iab|primitives)$/u,
		replacement: resolve(__dirname, '$1/src/public-api.ts'),
	},
	{
		find: '@inth/conformance',
		replacement: resolve(
			__dirname,
			'../../../internals/conformance/src/index.ts'
		),
	},
	{
		find: '~',
		replacement: resolve(__dirname, '../core/src'),
	},
];

export default mergeConfig(
	baseConfig,
	defineConfig({
		plugins: [
			angular({ tsconfig: resolve(__dirname, 'tsconfig.spec.json') }),
			privateSdkNames(import.meta.dirname),
		],
		resolve: {
			alias: workspaceAliases,
			conditions: ['browser'],
		},
		test: {
			coverage: {
				exclude: ['dist/**'],
			},
			environment: 'jsdom',
			include: [
				'src/**/*.spec.ts',
				'{consent-dialog,consent-dialog-trigger,consent-gate,consent-root,consent-widget,iab,primitives}/src/**/*.spec.ts',
				'devtools/src/**/*.spec.ts',
				'ssr/src/**/*.spec.ts',
				'testing/src/**/*.spec.ts',
				'schematics/**/*.spec.ts',
			],
			// The Angular plugin defaults the pool to `vmThreads`, which runs each
			// file in its own VM realm. Node's `structuredClone` then returns
			// objects from the outer realm, and @inth/sdk/schema's plain-object
			// checks (`Object.getPrototypeOf(value) === Object.prototype`) reject
			// them. Vitest's default pool keeps one realm, as every other package.
			pool: 'forks',
			setupFiles: ['./src/test-setup.ts'],
		},
	})
);
