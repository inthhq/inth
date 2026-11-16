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
// Workspace packages resolve to their source, as in @c15t/svelte, so the
// conformance driver's imports of core internals (persistence writer
// preload, record codec) share module state with the runtime under test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import angular from '@analogjs/vite-plugin-angular';
import { baseConfig } from '@c15t/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

// Vite resolves a `@c15t/ui` style subpath through its `style` condition to
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
					find: `@c15t/ui/${subpath.slice(2)}`,
					replacement: resolve(__dirname, '../ui', target.import),
				},
			]
		: []
);
// The rest go through the `./styles/components/*` pattern.
uiStyleAliases.push({
	find: /^@c15t\/ui\/styles\/components\/(?<name>[a-z-]+)$/u,
	replacement: resolve(__dirname, '../ui/dist/styles/components/$1.js'),
});

const workspaceAliases = [
	...uiStyleAliases,
	{
		find: '@c15t/core/build',
		replacement: resolve(__dirname, '../core/src/build.ts'),
	},
	{
		find: '@c15t/core/events',
		replacement: resolve(__dirname, '../core/src/events.ts'),
	},
	{
		find: '@c15t/core/modes',
		replacement: resolve(__dirname, '../core/src/modes.ts'),
	},
	{
		find: '@c15t/core/transports/manifest-browser',
		replacement: resolve(
			__dirname,
			'../core/src/transports/manifest-browser.ts'
		),
	},
	{
		find: '@c15t/core/transports/hosted-factory',
		replacement: resolve(__dirname, '../core/src/transports/hosted-factory.ts'),
	},
	{
		find: '@c15t/core/transports',
		replacement: resolve(__dirname, '../core/src/transports/index.ts'),
	},
	{
		find: '@c15t/core/runtime/client-mode',
		replacement: resolve(__dirname, '../core/src/runtime/client-mode.ts'),
	},
	{
		find: '@c15t/core/runtime/provider',
		replacement: resolve(__dirname, '../core/src/runtime/provider.ts'),
	},
	{
		find: '@c15t/core/runtime/on-demand',
		replacement: resolve(__dirname, '../core/src/runtime/on-demand.ts'),
	},
	{
		find: '@c15t/core/runtime/deferred-boot',
		replacement: resolve(__dirname, '../core/src/runtime/deferred-boot.ts'),
	},
	{
		find: '@c15t/core/runtime/save-preload',
		replacement: resolve(__dirname, '../core/src/runtime/save-preload.ts'),
	},
	{
		find: '@c15t/core/runtime/script-server-start',
		replacement: resolve(
			__dirname,
			'../core/src/runtime/script-server-start.ts'
		),
	},
	{
		find: '@c15t/core/runtime',
		replacement: resolve(__dirname, '../core/src/runtime/index.ts'),
	},
	{
		find: '@c15t/core/modules/iframe-blocker',
		replacement: resolve(
			__dirname,
			'../core/src/modules/iframe-blocker/index.ts'
		),
	},
	{
		find: '@c15t/core/modules/network-blocker',
		replacement: resolve(
			__dirname,
			'../core/src/modules/network-blocker/index.ts'
		),
	},
	{
		find: '@c15t/core/modules/network-hold',
		replacement: resolve(
			__dirname,
			'../core/src/modules/network-blocker/hold.ts'
		),
	},
	{
		find: '@c15t/core/modules/persistence',
		replacement: resolve(__dirname, '../core/src/modules/persistence/index.ts'),
	},
	{
		find: '@c15t/core/modules/clear-on-revocation',
		replacement: resolve(
			__dirname,
			'../core/src/modules/clear-on-revocation/index.ts'
		),
	},
	{
		find: '@c15t/core/modules/script-loader',
		replacement: resolve(
			__dirname,
			'../core/src/modules/script-loader/index.ts'
		),
	},
	{
		find: '@c15t/core/modules/window-debug',
		replacement: resolve(
			__dirname,
			'../core/src/modules/window-debug/index.ts'
		),
	},
	{
		find: '@c15t/core/preference-draft',
		replacement: resolve(__dirname, '../core/src/preference-draft/index.ts'),
	},
	{
		find: '@c15t/core/server',
		replacement: resolve(__dirname, '../core/src/server/index.ts'),
	},
	// The deferred root's subpaths, before their prefixes.
	{
		find: '@c15t/core/surface-actions/early-commit',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/early-commit.ts'
		),
	},
	{
		find: '@c15t/core/surface-actions/plain-scripts',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/plain-scripts.ts'
		),
	},
	{
		find: '@c15t/core/surface-actions/instant-commit',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/instant-commit.ts'
		),
	},
	{
		find: '@c15t/core/surface-actions/stored-records',
		replacement: resolve(
			__dirname,
			'../core/src/surface-actions/stored-records.ts'
		),
	},
	{
		find: '@c15t/core/iab-support',
		replacement: resolve(__dirname, '../core/src/iab-support.ts'),
	},
	{
		find: '@c15t/core/surface-state',
		replacement: resolve(__dirname, '../core/src/surface-state.ts'),
	},
	{
		find: '@c15t/core/surface-actions',
		replacement: resolve(__dirname, '../core/src/surface-actions/index.ts'),
	},
	// Before the bare specifier: Vite matches string aliases by prefix, so
	// `@c15t/iab` alone would rewrite `@c15t/iab/headless` into a path that
	// does not exist.
	{
		find: '@c15t/iab/headless',
		replacement: resolve(__dirname, '../iab/src/headless.ts'),
	},
	{
		find: '@c15t/iab/gpp',
		replacement: resolve(__dirname, '../iab/src/gpp.ts'),
	},
	{
		find: '@c15t/iab',
		replacement: resolve(__dirname, '../iab/src/index.ts'),
	},
	{
		find: '@c15t/schema/types',
		replacement: resolve(__dirname, '../schema/src/types.ts'),
	},
	{
		find: '@c15t/schema/config',
		replacement: resolve(__dirname, '../schema/src/config/index.ts'),
	},
	{
		find: '@c15t/schema/canonical-order',
		replacement: resolve(__dirname, '../schema/src/shared/canonical-order.ts'),
	},
	{
		find: '@c15t/schema',
		replacement: resolve(__dirname, '../schema/src/index.ts'),
	},
	{
		find: '@c15t/core',
		replacement: resolve(__dirname, '../core/src/index.ts'),
	},
	// Secondary entry points import the primary by its package name.
	{
		find: /^@c15t\/angular$/u,
		replacement: resolve(__dirname, 'src/public-api.ts'),
	},
	{
		find: /^@c15t\/angular\/(?<entry>consent-dialog|consent-dialog-trigger|consent-gate|consent-root|consent-widget|iab|primitives)$/u,
		replacement: resolve(__dirname, '$1/src/public-api.ts'),
	},
	{
		find: '@c15t/conformance',
		replacement: resolve(__dirname, '../../internals/conformance/src/index.ts'),
	},
	{
		find: '~',
		replacement: resolve(__dirname, '../core/src'),
	},
];

export default mergeConfig(
	baseConfig,
	defineConfig({
		plugins: [angular({ tsconfig: resolve(__dirname, 'tsconfig.spec.json') })],
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
			// objects from the outer realm, and @c15t/schema's plain-object
			// checks (`Object.getPrototypeOf(value) === Object.prototype`) reject
			// them. Vitest's default pool keeps one realm, as every other package.
			pool: 'forks',
			setupFiles: ['./src/test-setup.ts'],
		},
	})
);
