/** @vitest-environment node */
/**
 * The script registry's `files` in real Chromium, with LogRocket's real
 * loader and the logger it downloads while it runs, served from a fake
 * gateway. jsdom fetches and checks nothing, so only a browser shows that
 * the logger loads from the gateway under its hash, and that other bytes,
 * a `null` entry, or a URL the list does not name behave as documented.
 *
 * The files are LogRocket's, so they are not kept in the repository: the
 * test downloads them from LogRocket's CDN, or reads them from the
 * directory `INTH_LOGROCKET_FILES` names (`LogRocket.min.js` and
 * `logger-1.min.js`) to run offline. Their hashes are computed here, so
 * the test does not depend on which release the CDN serves.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	test,
	vi,
} from 'vitest';

import type { ScriptFilesPage } from './__tests__/script-files-page';

vi.setConfig({ testTimeout: 30_000 });

declare global {
	interface Window {
		__SDKCONFIG__?: { loggerURL?: string };
		__TAMPERED_RAN?: boolean;
		__scriptFiles: ScriptFilesPage;
		_LRLogger?: unknown;
	}
}

const repository = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../..'
);
const SITE = 'https://site.inth.test';
const GATEWAY = 'https://gateway.inth.test';
const LOADER_URL = 'https://cdn.logrocket.io/LogRocket.min.js';
const LOGGER_URL = 'https://cdn.logrocket.io/logger-1.min.js';
/** Where `__SDKCONFIG__.loggerURL` sends the loader: a URL no list names. */
const OVERRIDE_URL = 'https://cdn.logrocket.io/logger-2.min.js';
/** The CSP the docs recommend: the gateway and the site, no vendor host. */
const CSP = `script-src 'self' ${GATEWAY}; worker-src blob:`;

const sri = (bytes: Buffer) =>
	`sha384-${createHash('sha384').update(bytes).digest('base64')}`;
const short = (bytes: Buffer) =>
	createHash('sha256').update(bytes).digest('hex').slice(0, 16);

const vendorFile = async function vendorFile(url: string): Promise<Buffer> {
	const directory = process.env.INTH_LOGROCKET_FILES;
	if (directory) {
		return readFile(resolve(directory, new URL(url).pathname.slice(1)));
	}
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url} answered ${response.status}.`);
	}
	return Buffer.from(await response.arrayBuffer());
};

let browser: Browser;
let bundle: string;
let loader: Buffer;
let logger: Buffer;
let gatewayFiles: Map<string, Buffer>;
let loaderAtGateway: string;
let loggerAtGateway: string;
let tamperedAtGateway: string;

let context: BrowserContext;
let page: Page;
let messages: string[];
/** Every script a response finished for, by URL. */
let loadedScripts: string[];
/** Every request the page sent, by URL. */
let requested: string[];

const loaded = (url: string) =>
	loadedScripts.filter((script) => script === url).length;
const sent = (url: string) =>
	requested.filter((request) => request === url).length;

/** Each script tag with a `src`, as the browser fetched it. */
const scriptTags = () =>
	page.evaluate(() =>
		[...document.scripts]
			.filter((script) => script.getAttribute('src'))
			.map((script) => ({
				crossorigin: script.getAttribute('crossorigin'),
				integrity: script.getAttribute('integrity'),
				src: script.getAttribute('src'),
				type: script.getAttribute('type'),
			}))
	);

let logRocketId: string;
const registry = (file: unknown) => ({
	files: { [LOGGER_URL]: file },
	sources: {
		[logRocketId]: { integrity: sri(loader), src: loaderAtGateway },
	},
});

const loggerRan = () =>
	expect
		.poll(() => page.evaluate(() => typeof window._LRLogger))
		.toBe('function');

/** Wait for LogRocket's own handler of a logger that did not load. */
const loaderGaveUp = () =>
	expect
		.poll(() =>
			messages.some((line) => line.includes('LogRocket: script could not load'))
		)
		.toBe(true);

const open = async function open(csp?: string): Promise<void> {
	const html = `<!doctype html><html><head><script src="/bundle.js"></script></head><body></body></html>`;
	await context.route(`${SITE}/**`, (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname === '/bundle.js') {
			return route.fulfill({
				body: bundle,
				contentType: 'application/javascript',
			});
		}
		return route.fulfill({
			body: html,
			contentType: 'text/html',
			headers: csp ? { 'content-security-policy': csp } : {},
		});
	});
	await page.goto(`${SITE}/`);
	logRocketId = await page.evaluate(() => window.__scriptFiles.logRocketId);
};

beforeAll(async () => {
	[loader, logger] = await Promise.all([
		vendorFile(LOADER_URL),
		vendorFile(LOGGER_URL),
	]);
	// The loader must still ask for the logger at the URL the list keys.
	expect(loader.includes('logger-1.min.js')).toBe(true);
	const tampered = Buffer.concat([
		Buffer.from('window.__TAMPERED_RAN = true;\n'),
		logger,
	]);
	loaderAtGateway = `${GATEWAY}/scripts/logrocket@${short(loader)}.js`;
	loggerAtGateway = `${GATEWAY}/scripts/logrocket-logger@${short(logger)}.js`;
	tamperedAtGateway = `${GATEWAY}/tampered/logrocket-logger@${short(logger)}.js`;
	gatewayFiles = new Map([
		[loaderAtGateway, loader],
		[loggerAtGateway, logger],
		[tamperedAtGateway, tampered],
		[`${GATEWAY}/scripts/placeholder.js`, Buffer.from('')],
	]);

	const result = await build({
		alias: {
			'#inline-start': resolve(
				repository,
				'packages/sdk/integrations/src/engine/inline-start-browser.ts'
			),
			'@inth/sdk/engine': resolve(repository, 'packages/sdk/core/src/index.ts'),
			'@inth/sdk/modules/script-loader': resolve(
				repository,
				'packages/sdk/core/src/modules/script-loader/index.ts'
			),
			'@inth/sdk/runtime': resolve(
				repository,
				'packages/sdk/core/src/runtime/index.ts'
			),
			'@inth/sdk/transports': resolve(
				repository,
				'packages/sdk/core/src/transports/index.ts'
			),
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		entryPoints: [
			resolve(
				repository,
				'packages/sdk/integrations/src/__tests__/script-files-page.ts'
			),
		],
		format: 'iife',
		nodePaths: [
			resolve(repository, 'packages/sdk/core/node_modules'),
			resolve(repository, 'packages/sdk/integrations/node_modules'),
			resolve(repository, 'node_modules'),
		],
		platform: 'browser',
		write: false,
	});
	const [output] = result.outputFiles;
	if (!output) {
		throw new Error('Expected a browser bundle of the runtime.');
	}
	bundle = output.text;
	browser = await chromium.launch();
}, 60_000);

/**
 * The vendor answers too, so a request that escapes the pin would run and
 * show up in the counts.
 */
const vendorBody = (url: string): Buffer | undefined => {
	if (url === LOADER_URL) {
		return loader;
	}
	return url === LOGGER_URL || url === OVERRIDE_URL ? logger : undefined;
};

beforeEach(async () => {
	context = await browser.newContext({ serviceWorkers: 'block' });
	messages = [];
	loadedScripts = [];
	requested = [];
	await context.routeWebSocket('**/*', (socket) => socket.close());
	await context.route('**/*', (route) => {
		const url = route.request().url();
		const body = gatewayFiles.get(url) ?? vendorBody(url);
		if (body) {
			return route.fulfill({
				body,
				contentType: 'application/javascript',
				headers: { 'access-control-allow-origin': '*' },
			});
		}
		// LogRocket's session uploads, and anything else, go nowhere.
		return route.fulfill({
			headers: { 'access-control-allow-origin': '*' },
			status: 204,
		});
	});
	context.on('request', (request) => {
		requested.push(request.url());
	});
	context.on('requestfinished', (request) => {
		if (request.resourceType() === 'script') {
			loadedScripts.push(request.url());
		}
	});
	page = await context.newPage();
	page.on('console', (message) => messages.push(message.text()));
});

afterEach(async () => {
	await context?.close();
});

afterAll(async () => {
	await browser?.close();
});

test("loads the logger LogRocket's loader requests from the gateway, with integrity", async () => {
	await open();
	await page.evaluate(
		(list) => window.__scriptFiles.start(list),
		registry({ integrity: sri(logger), src: loggerAtGateway })
	);

	await loggerRan();
	expect(loaded(loaderAtGateway)).toBe(1);
	expect(loaded(loggerAtGateway)).toBe(1);
	expect(sent(LOADER_URL) + sent(LOGGER_URL)).toBe(0);
	expect(await scriptTags()).toEqual([
		{
			crossorigin: null,
			integrity: null,
			src: '/bundle.js',
			type: null,
		},
		{
			crossorigin: 'anonymous',
			integrity: sri(loader),
			src: loaderAtGateway,
			type: null,
		},
		{
			crossorigin: 'anonymous',
			integrity: sri(logger),
			src: loggerAtGateway,
			type: null,
		},
	]);
	// LogRocket runs: it starts sending the session.
	await expect
		.poll(() =>
			requested.some((url) => /^https:\/\/r\.[^/]*logrocket/u.test(url))
		)
		.toBe(true);
});

test('refuses changed bytes at the gateway, and does not fall back to the vendor', async () => {
	await open();
	await page.evaluate(
		(list) => window.__scriptFiles.start(list),
		registry({ integrity: sri(logger), src: tamperedAtGateway })
	);

	await loaderGaveUp();
	expect(
		messages.some((line) =>
			line.includes(
				"Failed to find a valid digest in the 'integrity' attribute"
			)
		)
	).toBe(true);
	expect(
		await page.evaluate(() => ({
			logger: typeof window._LRLogger,
			tampered: window.__TAMPERED_RAN,
		}))
	).toEqual({ logger: 'undefined', tampered: undefined });
	expect(sent(LOGGER_URL)).toBe(0);
});

test('loads nothing for a null entry, and runs the loader’s own failure path', async () => {
	await open();
	await page.evaluate(
		(list) => window.__scriptFiles.start(list),
		registry(null)
	);

	await loaderGaveUp();
	expect(sent(LOGGER_URL) + sent(loggerAtGateway)).toBe(0);
	expect(await page.evaluate(() => typeof window._LRLogger)).toBe('undefined');
	expect((await scriptTags()).at(-1)).toEqual({
		crossorigin: null,
		integrity: null,
		src: LOGGER_URL,
		type: 'inth/held',
	});
});

test('leaves a URL the list does not name alone, such as a loggerURL override', async () => {
	await open();
	await page.evaluate(
		([url, list]) => {
			window.__SDKCONFIG__ = { loggerURL: url as string };
			window.__scriptFiles.start(list);
		},
		[OVERRIDE_URL, registry({ integrity: sri(logger), src: loggerAtGateway })]
	);

	await loggerRan();
	expect(loaded(OVERRIDE_URL)).toBe(1);
	expect(sent(loggerAtGateway)).toBe(0);
	expect((await scriptTags()).at(-1)).toEqual({
		crossorigin: null,
		integrity: null,
		src: OVERRIDE_URL,
		type: null,
	});
});

test('runs the pinned logger under the recommended CSP', async () => {
	await open(CSP);
	await page.evaluate(
		(list) => window.__scriptFiles.start(list),
		registry({ integrity: sri(logger), src: loggerAtGateway })
	);

	await loggerRan();
	expect(loaded(loggerAtGateway)).toBe(1);
	expect(sent(LOGGER_URL)).toBe(0);
});

test('refuses a loggerURL override the list does not name, under the recommended CSP', async () => {
	await open(CSP);
	await page.evaluate(
		([url, list]) => {
			window.__SDKCONFIG__ = { loggerURL: url as string };
			window.__scriptFiles.start(list);
		},
		[OVERRIDE_URL, registry({ integrity: sri(logger), src: loggerAtGateway })]
	);

	await loaderGaveUp();
	expect(
		messages.some(
			(line) =>
				line.includes(OVERRIDE_URL) && line.includes('Content Security Policy')
		)
	).toBe(true);
	expect(loaded(OVERRIDE_URL)).toBe(0);
	expect(await page.evaluate(() => typeof window._LRLogger)).toBe('undefined');
});

test('holds a logger the page inserts while the list is pending, then loads it from the gateway', async () => {
	await open();
	await page.evaluate(() => window.__scriptFiles.startPending());
	await page.evaluate((url) => {
		const script = document.createElement('script');
		script.src = url;
		script.addEventListener('load', () => {
			document.documentElement.dataset.early = 'loaded';
		});
		document.head.append(script);
	}, LOGGER_URL);
	await page.waitForTimeout(300);
	expect(sent(LOGGER_URL) + sent(loggerAtGateway)).toBe(0);

	await page.evaluate(
		(list) => window.__scriptFiles.answer(list),
		registry({ integrity: sri(logger), src: loggerAtGateway })
	);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.dataset.early))
		.toBe('loaded');
	expect(loaded(loggerAtGateway)).toBe(1);
	expect(sent(LOGGER_URL)).toBe(0);
});
