import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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
						// `?story=` names one of `privacy-choices-stories.ts`.
						if (request.url?.split('?')[0] !== '/__inth-test__/stories') {
							next();
							return;
						}
						response.setHeader('Content-Type', 'text/html');
						response.end(
							readFileSync(
								resolve(__dirname, 'src/__tests__/fixtures/stories.html')
							)
						);
					});
				},
				name: 'stories-fixture',
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
			{
				configureServer(server) {
					const received: Record<string, unknown>[] = [];
					let backendOrigin: string | null = null;
					const backend = createServer((request, response) => {
						const origin = request.headers.origin ?? '*';
						response.setHeader('Access-Control-Allow-Origin', origin);
						response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
						response.setHeader('Access-Control-Allow-Headers', 'content-type');
						if (request.method === 'OPTIONS') {
							// Hold the CORS preflight past same-tick navigation so a
							// non-keepalive fetch is cancelled when the page leaves.
							setTimeout(() => {
								response.statusCode = 204;
								response.end();
							}, 150);
							return;
						}
						if (
							request.url === '/v1/consent/opt-outs' &&
							request.method === 'POST'
						) {
							const chunks: Buffer[] = [];
							request.on('data', (chunk: Buffer) => chunks.push(chunk));
							request.on('end', () => {
								try {
									received.push(
										JSON.parse(
											Buffer.concat(chunks).toString('utf8')
										) as Record<string, unknown>
									);
								} catch {
									// Ignore malformed bodies.
								}
								response.setHeader('Content-Type', 'application/json');
								response.end(
									JSON.stringify({
										optOut: {
											heldBy: 'device',
											method: 'button',
											recordedAt: Date.now(),
											rights: ['sale', 'share'],
										},
										recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
										subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
									})
								);
							});
							return;
						}
						response.statusCode = 404;
						response.end();
					});
					backend.listen(0, '127.0.0.1', () => {
						const address = backend.address() as AddressInfo | null;
						if (address) {
							backendOrigin = `http://127.0.0.1:${address.port}`;
						}
					});
					backend.unref();
					server.httpServer?.once('close', () => {
						backend.close();
						backend.closeAllConnections?.();
					});

					server.middlewares.use((request, response, next) => {
						const path = request.url?.split('?')[0];
						if (path === '/__inth-test__/keepalive') {
							response.setHeader('Content-Type', 'text/html');
							response.end(
								readFileSync(
									resolve(__dirname, 'src/__tests__/fixtures/keepalive.html')
								)
							);
							return;
						}
						if (path === '/__inth-test__/keepalive-done') {
							response.setHeader('Content-Type', 'text/html');
							response.end('<!doctype html><html><body>done</body></html>');
							return;
						}
						if (path === '/__inth-test__/keepalive-origin') {
							response.setHeader('Content-Type', 'application/json');
							response.end(JSON.stringify({ origin: backendOrigin }));
							return;
						}
						if (path === '/__inth-test__/keepalive-received') {
							if (request.method === 'DELETE') {
								received.length = 0;
								response.statusCode = 204;
								response.end();
								return;
							}
							response.setHeader('Content-Type', 'application/json');
							response.end(JSON.stringify(received));
							return;
						}
						next();
					});
				},
				name: 'keepalive-fixture',
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
					replacement: resolve(__dirname, './src/ui/dialog-static.ts'),
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
						setupFiles: ['src/__tests__/fixtures/warm-ui.ts'],
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
									'../core/src/libs/page-globals.ts'
								),
							},
							{
								find: /^@inth\/sdk-core\/surface-actions$/u,
								replacement: resolve(
									__dirname,
									'../core/src/surface-actions/index.ts'
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
