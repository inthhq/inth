import { resolve } from 'node:path';

import { baseConfig } from '@inth/vitest-config/base';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import { privateSdkNames } from '../shared/private-sdk-names';

/** Requests the `serveScript` browser command answered, by URL. */
const servedScripts = new Map<string, number>();

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
			// it on first sight mid-run and reloads the page ("optimized
			// dependencies changed"), which vitest-browser-react does not
			// survive; a cold CI cache hits this on every run.
			exclude: [
				'@rsbuild/plugin-react',
				'@rslib/core',
				'@rsdoctor/rspack-plugin',
				'@rsdoctor/core',
				'@rspack/resolver',
				'@rspack/resolver-binding-wasm32-wasi',
			],
		},
		plugins: [react(), privateSdkNames(import.meta.dirname)],
		resolve: {
			alias: Object.fromEntries([
				['~', resolve(__dirname, './src')],
				// The suite renders the provider itself, on the server and in
				// the browser; the client root has tests of its own.
				['#consent-provider', resolve(__dirname, './src/provider.tsx')],
				[
					'#consent-banner',
					resolve(__dirname, './src/components/prompt/index.ts'),
				],
				// The showcase uses the React hooks re-exported by the Next adapter.
				['@inth/nextjs', resolve(__dirname, './src/index.ts')],
				// Astro's source island must share this test suite's React contexts
				// and coverage, rather than importing a second copy from dist.
				[
					'@inth/react/components/consent-dialog',
					resolve(__dirname, './src/components/panel/index.ts'),
				],
				['@inth/react/iab', resolve(__dirname, './src/iab.ts')],
				['@inth/react/context', resolve(__dirname, './src/context.ts')],
				['@inth/react', resolve(__dirname, './src/index.ts')],
				// Resolve core package to source so Vite can handle its dynamic
				// imports natively. rslib emits webpack-style chunks that Vite's
				// browser bundler cannot analyse.
				[
					'@inth/sdk/modules/clear-on-revocation',
					resolve(
						__dirname,
						'../core/src/modules/clear-on-revocation/index.ts'
					),
				],
				[
					'@inth/sdk/modules/script-loader',
					resolve(__dirname, '../core/src/modules/script-loader/index.ts'),
				],
				[
					'@inth/sdk/modules/network-blocker',
					resolve(__dirname, '../core/src/modules/network-blocker/index.ts'),
				],
				[
					'@inth/sdk/modules/network-hold',
					resolve(__dirname, '../core/src/modules/network-blocker/hold.ts'),
				],
				[
					'@inth/sdk/modules/iframe-blocker',
					resolve(__dirname, '../core/src/modules/iframe-blocker/index.ts'),
				],
				[
					'@inth/sdk/modules/persistence',
					resolve(__dirname, '../core/src/modules/persistence/index.ts'),
				],
				[
					'@inth/sdk/modules/window-debug',
					resolve(__dirname, '../core/src/modules/window-debug/index.ts'),
				],
				['@inth/sdk/events', resolve(__dirname, '../core/src/events.ts')],
				[
					'@inth/sdk/runtime/controls',
					resolve(__dirname, '../core/src/runtime/controls.ts'),
				],
				[
					'@inth/sdk/preference-draft',
					resolve(__dirname, '../core/src/preference-draft/index.ts'),
				],
				[
					'@inth/sdk/runtime/provider',
					resolve(__dirname, '../core/src/runtime/provider.ts'),
				],
				[
					'@inth/sdk/runtime/deferred-boot',
					resolve(__dirname, '../core/src/runtime/deferred-boot.ts'),
				],
				[
					'@inth/sdk/runtime/stand-in-kernel',
					resolve(__dirname, '../core/src/runtime/stand-in-kernel.ts'),
				],
				[
					'@inth/sdk/runtime/storage-for',
					resolve(__dirname, '../core/src/libs/storage-for.ts'),
				],
				[
					'@inth/sdk/runtime/deferred-snapshot',
					resolve(__dirname, '../core/src/runtime/deferred-snapshot.ts'),
				],
				[
					'@inth/sdk/transports/hosted-factory',
					resolve(__dirname, '../core/src/transports/hosted-factory.ts'),
				],
				[
					'@inth/sdk/runtime/script-server-start',
					resolve(__dirname, '../core/src/runtime/script-server-start.ts'),
				],
				[
					'@inth/sdk/runtime/page-globals',
					resolve(__dirname, '../core/src/libs/page-globals.ts'),
				],
				[
					'@inth/sdk/runtime',
					resolve(__dirname, '../core/src/runtime/index.ts'),
				],
				['@inth/sdk/server', resolve(__dirname, '../core/src/server/index.ts')],
				[
					'@inth/sdk/surface-actions/early-commit',
					resolve(__dirname, '../core/src/surface-actions/early-commit.ts'),
				],
				[
					'@inth/sdk/surface-actions/instant-commit',
					resolve(__dirname, '../core/src/surface-actions/instant-commit.ts'),
				],
				[
					'@inth/sdk/surface-actions/plain-scripts',
					resolve(__dirname, '../core/src/surface-actions/plain-scripts.ts'),
				],
				[
					'@inth/sdk/surface-actions',
					resolve(__dirname, '../core/src/surface-actions/index.ts'),
				],
				['@inth/sdk/generated', resolve(__dirname, '../core/src/generated.ts')],
				[
					'@inth/sdk/transports/manifest-browser',
					resolve(__dirname, '../core/src/transports/manifest-browser.ts'),
				],
				// After the `@inth/sdk/transports/*` entries above: aliases match
				// by prefix, in order.
				[
					'@inth/sdk/transports',
					resolve(__dirname, '../core/src/transports/index.ts'),
				],
				[
					'@inth/sdk/iab-support',
					resolve(__dirname, '../core/src/iab-support.ts'),
				],
				['@inth/sdk/testing', resolve(__dirname, '../core/src/testing.ts')],
				['@inth/sdk/modes', resolve(__dirname, '../core/src/modes.ts')],
				['@inth/sdk/engine', resolve(__dirname, '../core/src/index.ts')],
				[
					'@inth/sdk/schema/types',
					resolve(__dirname, '../schema/src/types.ts'),
				],
				[
					'@inth/sdk/schema/config',
					resolve(__dirname, '../schema/src/config/index.ts'),
				],
				[
					'@inth/sdk/schema/canonical-order',
					resolve(__dirname, '../schema/src/shared/canonical-order.ts'),
				],
				['@inth/sdk/schema', resolve(__dirname, '../schema/src/index.ts')],
				[
					'@inth/sdk/translations/all',
					resolve(__dirname, '../translations/src/all.ts'),
				],
				[
					'@inth/sdk/translations/en',
					resolve(__dirname, '../translations/src/translations/en.ts'),
				],
				[
					'@inth/sdk/translations',
					resolve(__dirname, '../translations/src/index.ts'),
				],
				[
					'@inth/sdk/ui/primitives/collapsible',
					resolve(__dirname, '../ui/src/primitives/collapsible/index.ts'),
				],
				[
					'@inth/sdk/ui/primitives/preference-item',
					resolve(__dirname, '../ui/src/primitives/preference-item/index.ts'),
				],
				[
					'@inth/sdk/ui/primitives/tabs',
					resolve(__dirname, '../ui/src/primitives/tabs/index.ts'),
				],
				[
					'@inth/sdk/ui/styles/primitives/collapsible',
					resolve(__dirname, '../ui/src/styles/primitives/collapsible.ts'),
				],
				[
					'@inth/sdk/ui/styles/primitives/preference-item',
					resolve(__dirname, '../ui/src/styles/primitives/preference-item.ts'),
				],
				[
					'@inth/sdk/ui/styles/primitives/tabs',
					resolve(__dirname, '../ui/src/styles/primitives/tabs.ts'),
				],
				// @inth/sdk/iab depends on @iabtechlabtcf/core which is only
				// installed in the iab package's node_modules.
				[
					'@iabtechlabtcf/core',
					resolve(__dirname, '../iab/node_modules/@iabtechlabtcf/core'),
				],
				[
					'@inth/sdk/iab/headless',
					resolve(__dirname, '../iab/src/headless.ts'),
				],
				['@inth/sdk/iab/gpp', resolve(__dirname, '../iab/src/gpp.ts')],
				['@inth/sdk/iab', resolve(__dirname, '../iab/src/index.ts')],
				['react', resolve(__dirname, './node_modules/react')],
				['react-dom', resolve(__dirname, './node_modules/react-dom')],
			]),
		},
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
			browser: {
				commands: {
					/**
					 * Answers requests for `url` with `body` as JavaScript, the
					 * way a CDN that allows CORS would, and counts them. Lets a
					 * test load a script from an https URL whose bytes it knows.
					 */
					async serveScript(context, url: string, body: string) {
						const { page } = context as unknown as {
							page: {
								route: (
									url: string,
									handler: (route: {
										fulfill: (response: {
											body: string;
											contentType: string;
											headers: Record<string, string>;
										}) => Promise<void>;
									}) => Promise<void>
								) => Promise<void>;
							};
						};
						await page.route(url, (route) => {
							servedScripts.set(url, (servedScripts.get(url) ?? 0) + 1);
							return route.fulfill({
								body,
								contentType: 'text/javascript',
								headers: { 'access-control-allow-origin': '*' },
							});
						});
					},
					/** How many requests `serveScript` answered for `url`. */
					servedScriptCount(_context, url: string) {
						return servedScripts.get(url) ?? 0;
					},
				},
				enabled: true,
				headless: true,
				instances: [{ browser: 'chromium' }],
				// Headless Chromium hides scrollbars by default. Showing them keeps
				// classic scrollbar layout (as on Windows and Linux) testable.
				provider: playwright({
					launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
				}),
			},
			coverage: {
				// Coverage ratchet: floors below current coverage so regressions
				// fail CI. Raise as coverage improves; never lower.
				thresholds: {
					branches: 50,
					functions: 60,
					lines: 65,
					statements: 60,
				},
			},
			include: [
				'src/**/*.test.tsx',
				'src/**/*.test.ts',
				'src/**/*.spec.tsx',
				'src/**/*.spec.ts',
				'src/**/*.e2e.test.tsx',
			],
			retry: 2,
			setupFiles: ['./src/test-setup.browser.ts'],
		},
	})
);
