import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseConfig } from '@inth/vitest-config/base';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import { serveInitScriptFixture } from './src/__tests__/fixtures/init-script-server';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The token the WebView fixture's native script was given. */
const WEBVIEW_TOKEN = 'feedc0de00000000feedc0de00000000';
/** The request key the WebView fixture's native script was given. */
const WEBVIEW_KEY = '0badc0de0badc0de0badc0de0badc0de';

export default mergeConfig(
	baseConfig,
	defineConfig({
		plugins: [
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						void serveInitScriptFixture(
							request,
							response,
							next,
							resolve(__dirname, 'dist')
						);
					});
				},
				name: 'init-script-fixture',
			},
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						if (request.url !== '/__inth-test__/gated-script-csp') {
							next();
							return;
						}
						response.setHeader('Content-Type', 'text/html');
						response.setHeader(
							'Content-Security-Policy',
							"script-src 'nonce-inth-test-nonce'"
						);
						response.end(
							readFileSync(
								resolve(
									__dirname,
									'src/__tests__/fixtures/gated-scripts-csp.html'
								)
							)
						);
					});
				},
				name: 'gated-script-csp-fixture',
			},
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						if (request.url === '/__inth-test__/injected.js') {
							response.setHeader('Content-Type', 'text/javascript');
							response.end(
								"document.documentElement.dataset.externalInjected = 'true';"
							);
							return;
						}
						if (request.url !== '/__inth-test__/strict-dynamic') {
							next();
							return;
						}
						response.setHeader('Content-Type', 'text/html');
						response.setHeader(
							'Content-Security-Policy',
							"script-src 'nonce-inth-test-nonce' 'strict-dynamic'"
						);
						response.end(
							readFileSync(
								resolve(
									__dirname,
									'src/__tests__/fixtures/gated-scripts-strict-dynamic.html'
								)
							)
						);
					});
				},
				name: 'gated-script-strict-dynamic-fixture',
			},
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						const url = new URL(request.url ?? '/', 'http://fixture');
						if (url.pathname !== '/__inth-test__/webview') {
							next();
							return;
						}
						// The native document-start script, first in <head>, as a
						// WebView injects it. `?origin=other` lists an origin this
						// page is not on.
						const here = `http://${request.headers.host}`;
						const origins =
							url.searchParams.get('origin') === 'other'
								? ['https://app.example']
								: [here];
						const state = {
							gppString: null,
							model: 'opt-in',
							permissions: {
								experience: false,
								functionality: false,
								marketing: false,
								measurement: true,
								necessary: true,
							},
							ready: true,
							revision: 3,
							tcString: null,
							version: 1,
						};
						const nativeScript = `${readFileSync(
							resolve(
								__dirname,
								'../../native-protocol/webview/document-start.js'
							),
							'utf8'
						)
							.trim()
							.replace(
								/;$/u,
								''
							)}(${JSON.stringify(origins)},"${WEBVIEW_TOKEN}","${WEBVIEW_KEY}",${JSON.stringify(state)});`;
						response.setHeader('Content-Type', 'text/html');
						response.end(
							readFileSync(
								resolve(__dirname, 'src/__tests__/fixtures/webview.html'),
								'utf8'
							).replace('/* native document-start script */', nativeScript)
						);
					});
				},
				name: 'webview-fixture',
			},
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						if (!request.url?.startsWith('/__inth-test__/ui-csp')) {
							next();
							return;
						}
						response.setHeader('Content-Type', 'text/html');
						response.setHeader(
							'Content-Security-Policy',
							"style-src 'nonce-inth-test-nonce'"
						);
						response.end(
							readFileSync(
								resolve(__dirname, 'src/__tests__/fixtures/ui-csp.html')
							)
						);
					});
				},
				name: 'ui-csp-fixture',
			},
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						if (request.url !== '/__inth-test__/storage-sync') {
							next();
							return;
						}
						response.setHeader('Content-Type', 'text/html');
						response.end(
							readFileSync(
								resolve(__dirname, 'src/__tests__/fixtures/storage-sync.html')
							)
						);
					});
				},
				name: 'storage-sync-fixture',
			},
			{
				configureServer(server) {
					server.middlewares.use((request, response, next) => {
						// The query carries fixture flags such as `?hold`.
						if (
							request.url?.split('?')[0] !== '/__inth-test__/subject-conflict'
						) {
							next();
							return;
						}
						response.setHeader('Content-Type', 'text/html');
						response.end(
							readFileSync(
								resolve(
									__dirname,
									'src/__tests__/fixtures/subject-conflict.html'
								)
							)
						);
					});
				},
				name: 'subject-conflict-fixture',
			},
		],
		resolve: {
			alias: [
				{ find: '~', replacement: resolve(__dirname, './src') },
				// As in the script-tag builds: the suites drive the dialog
				// synchronously. `dialog-surface.test.ts` covers the on-demand
				// surface the ESM build ships, imported by another specifier.
				{
					find: /^\.\/dialog-surface$/u,
					replacement: resolve(__dirname, './src/ui/dialog.ts'),
				},
				// Also as in the script-tag builds: the write code is loaded from
				// the start, so a save is stored in the macrotask after it, not
				// once a chunk lands, possibly in a later test's storage.
				{
					find: /^\.\/writer-loader(?<extension>\.js)?$/u,
					replacement: './writer-loader-static$<extension>',
				},
			],
		},
		test: {
			coverage: {
				// Coverage ratchet: floors below current coverage so regressions
				// fail CI. Raise as coverage improves; never lower.
				thresholds: {
					branches: 60,
					functions: 70,
					lines: 70,
					statements: 70,
				},
			},
			projects: [
				{
					extends: true,
					test: {
						environment: 'jsdom',
						exclude: ['src/**/*.browser.test.ts'],
						include: ['src/**/__tests__/**/*.test.ts'],
						name: 'unit',
					},
				},
				{
					extends: true,
					resolve: {
						alias: [
							{
								find: '@inth/sdk-core/runtime/provider',
								replacement: resolve(
									__dirname,
									'../core/src/runtime/provider.ts'
								),
							},
							{
								find: '@inth/sdk-core/runtime/deferred-snapshot',
								replacement: resolve(
									__dirname,
									'../core/src/runtime/deferred-snapshot.ts'
								),
							},
							{
								find: '@inth/sdk-core/runtime/on-demand',
								replacement: resolve(
									__dirname,
									'../core/src/runtime/on-demand.ts'
								),
							},
							{
								find: '@inth/sdk-core/runtime/page-globals',
								replacement: resolve(
									__dirname,
									'../core/src/runtime/page-globals.ts'
								),
							},
							{
								find: '@inth/sdk-core/runtime',
								replacement: resolve(__dirname, '../core/src/runtime/index.ts'),
							},
							{
								find: /^@inth\/sdk-core$/u,
								replacement: resolve(__dirname, '../core/src/index.ts'),
							},
							{
								find: '@inth/sdk-iab/headless',
								replacement: resolve(__dirname, '../iab/src/headless.ts'),
							},
							{
								find: /^@inth\/sdk-iab$/u,
								replacement: resolve(__dirname, '../iab/src/index.ts'),
							},
						],
					},
					server: { watch: null },
					test: {
						browser: {
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }],
							provider: playwright(),
						},
						include: ['src/**/*.browser.test.ts'],
						name: 'browser',
					},
				},
			],
		},
	})
);
