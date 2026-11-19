/** @vitest-environment node */
/**
 * The script registry's `files` in real Chromium, with a loader and the
 * logger it downloads while it runs, served from a fake gateway. jsdom
 * fetches and checks nothing, so only a browser shows that the logger
 * loads from the gateway under its hash, and that other bytes, a `null`
 * entry, or a URL the list does not name behave as documented.
 *
 * By default the loader and logger are small stand-ins that load the way
 * LogRocket's do, so the required run needs no network. LogRocket's files
 * are its own and are not kept in the repository. To run the same cases
 * against them, set `INTH_LOGROCKET_LIVE=1` to download them from
 * LogRocket's CDN, or `INTH_LOGROCKET_FILES` to a directory holding
 * `LogRocket.min.js` and `logger-1.min.js`. Hashes are computed here, so
 * the test does not depend on which release the CDN serves.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
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
/** A library on another origin, and an app script on the site that needs it. */
const LIBRARY_URL = 'https://cdn.library.inth.test/lib.js';
const LIBRARY = `window.library = true; (window.ran ||= []).push('lib');`;
const APP = `(window.ran ||= []).push(window.library ? 'app' : 'app without lib');`;

const sri = (bytes: Buffer) =>
	`sha384-${createHash('sha384').update(bytes).digest('base64')}`;
const short = (bytes: Buffer) =>
	createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/**
 * The engine the cases run in: Chromium in the required run, or the one
 * `INTH_SCRIPT_FILES_BROWSER` names (`firefox`, `webkit`).
 */
const ENGINE =
	{ firefox, webkit }[process.env.INTH_SCRIPT_FILES_BROWSER ?? ''] ?? chromium;

/** Whether the cases run against LogRocket's own files. */
const LIVE =
	process.env.INTH_LOGROCKET_LIVE === '1' ||
	Boolean(process.env.INTH_LOGROCKET_FILES);

/**
 * Stand-ins for LogRocket's loader and logger. The loader defines
 * `window.LogRocket`, inserts the logger from `__SDKCONFIG__.loggerURL`,
 * `_lrAsyncScript` or `logger-1.min.js`, and logs LogRocket's own message
 * when the logger does not load. The logger starts sending a session.
 */
const STAND_INS = new Map([
	[
		'https://cdn.logrocket.io/LogRocket.min.js',
		`(() => {
	window.LogRocket = { init() {} };
	const script = document.createElement('script');
	script.async = true;
	script.src = (window.__SDKCONFIG__ && window.__SDKCONFIG__.loggerURL) ||
		window._lrAsyncScript || 'https://cdn.logrocket.io/logger-1.min.js';
	script.onerror = () => console.error('LogRocket: script could not load');
	document.head.appendChild(script);
})();`,
	],
	[
		'https://cdn.logrocket.io/logger-1.min.js',
		`window._LRLogger = function () {};
fetch('https://r.logrocket.inth.test/i', { method: 'POST', mode: 'no-cors' });`,
	],
]);

const vendorFile = async function vendorFile(url: string): Promise<Buffer> {
	if (!LIVE) {
		return Buffer.from(STAND_INS.get(url) ?? '');
	}
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
		[logRocketId]: {
			integrity: sri(loader),
			// As the gateway sends it for LogRocket: with either option the
			// loader downloads its logger from that server instead.
			refuseIfSet: ['initOptions.sdkServer', 'initOptions.enterpriseServer'],
			src: loaderAtGateway,
		},
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
		if (pathname === '/app.js') {
			return route.fulfill({
				body: APP,
				contentType: 'application/javascript',
			});
		}
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
	loggerAtGateway = `${GATEWAY}/scripts/logrocket/logger@${short(logger)}.js`;
	tamperedAtGateway = `${GATEWAY}/tampered/logrocket/logger@${short(logger)}.js`;
	gatewayFiles = new Map([
		[loaderAtGateway, loader],
		[loggerAtGateway, logger],
		[tamperedAtGateway, tampered],
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
	browser = await ENGINE.launch();
}, 60_000);

/**
 * The vendor answers too, so a request that escapes the pin would run and
 * show up in the counts.
 */
const vendorBody = (url: string): Buffer | undefined => {
	if (url === LOADER_URL) {
		return loader;
	}
	if (url === LIBRARY_URL) {
		return Buffer.from(LIBRARY);
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
	// Each engine words it differently; each names the integrity check.
	expect(messages.some((line) => /integrity/iu.test(line))).toBe(true);
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
		crossorigin: 'anonymous',
		integrity: expect.stringMatching(/^sha384-/u),
		src: 'data:text/javascript,',
		type: null,
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

test('loads nothing, from the gateway or the vendor, when initOptions sets a refuseIfSet path', async () => {
	await open();
	await page.evaluate(
		(list) =>
			window.__scriptFiles.start(list, {
				sdkServer: 'https://lr-sdk.inth.test',
			}),
		registry({ integrity: sri(logger), src: loggerAtGateway })
	);

	await expect
		.poll(() => page.evaluate(() => window.__scriptFiles.errors))
		.toEqual([expect.stringContaining('initOptions.sdkServer')]);
	await page.waitForTimeout(300);
	expect(
		requested.filter(
			(url) =>
				url.startsWith(GATEWAY) ||
				url.startsWith('https://cdn.logrocket.io/') ||
				url.startsWith('https://lr-sdk.inth.test/')
		)
	).toEqual([]);
	expect(
		await page.evaluate(() => ({
			logRocket: typeof window.LogRocket,
			logger: typeof window._LRLogger,
		}))
	).toEqual({ logRocket: 'undefined', logger: 'undefined' });
});

test('starts LogRocket only once the list arrives, with its logger pinned', async () => {
	await open();
	await page.evaluate(() => window.__scriptFiles.startPending());
	await page.waitForTimeout(300);
	expect(requested.filter((url) => !url.startsWith(SITE))).toEqual([]);

	await page.evaluate(
		(list) => window.__scriptFiles.answer(list),
		registry({ integrity: sri(logger), src: loggerAtGateway })
	);
	await loggerRan();
	expect(loaded(loaderAtGateway)).toBe(1);
	expect(loaded(loggerAtGateway)).toBe(1);
	expect(sent(LOADER_URL) + sent(LOGGER_URL)).toBe(0);
});

test('runs scripts the registry does not manage in order, without waiting for init', async () => {
	await open();
	// Init never answers: the list stays pending.
	await page.evaluate(() => window.__scriptFiles.startPending());
	await page.evaluate((library) => {
		for (const src of [library, '/app.js']) {
			const script = document.createElement('script');
			script.async = false;
			script.src = src;
			document.head.append(script);
		}
	}, LIBRARY_URL);

	await expect
		.poll(() => page.evaluate(() => (window as { ran?: string[] }).ran))
		.toEqual(['lib', 'app']);
});

/**
 * Insert the logger as page code would, and report how it ended and the
 * URL it loaded from.
 */
const insertLogger = () =>
	page.evaluate(
		(url) =>
			// oxlint-disable-next-line promise/avoid-new -- Settled by the element's events.
			new Promise<{ ended: string; src: string | null }>((_resolve) => {
				const script = document.createElement('script');
				script.src = url;
				const end = (ended: string) => () =>
					_resolve({ ended, src: script.getAttribute('src') });
				script.addEventListener('load', end('load'));
				script.addEventListener('error', end('error'));
				document.head.append(script);
			}),
		LOGGER_URL
	);

test('pins again after a library wrote back a method it saved before the pin', async () => {
	await open();
	const list = registry({ integrity: sri(logger), src: loggerAtGateway });
	await page.evaluate((answer) => {
		(window as { savedAppend?: unknown }).savedAppend =
			Node.prototype.appendChild;
		window.__scriptFiles.start(answer);
	}, list);
	await loggerRan();
	await page.evaluate((answer) => {
		// The library restores what it saved, over the pin's wrapper.
		Node.prototype.appendChild = (window as { savedAppend?: unknown })
			.savedAppend as typeof Node.prototype.appendChild;
		window.__scriptFiles.dispose();
		window.__scriptFiles.start(answer);
	}, list);

	expect(await insertLogger()).toEqual({ ended: 'load', src: loggerAtGateway });
	expect(sent(LOGGER_URL)).toBe(0);
});

test("keeps a library's src setter that went on between two pins", async () => {
	await open();
	const list = registry({ integrity: sri(logger), src: loggerAtGateway });
	await page.evaluate((answer) => {
		window.__scriptFiles.start(answer);
		window.__scriptFiles.dispose();
		const proto = HTMLScriptElement.prototype;
		const below = Object.getOwnPropertyDescriptor(
			proto,
			'src'
		) as PropertyDescriptor;
		const seen: unknown[] = [];
		(window as { seen?: unknown[] }).seen = seen;
		const librarySet = function librarySet(
			this: HTMLScriptElement,
			value: unknown
		) {
			seen.push(String(value));
			below.set?.call(this, value);
		};
		(window as { librarySet?: unknown }).librarySet = librarySet;
		Object.defineProperty(proto, 'src', {
			...below,
			get: below.get,
			set: librarySet,
		});
		window.__scriptFiles.start(answer);
	}, list);
	await loggerRan();

	expect(await insertLogger()).toEqual({ ended: 'load', src: loggerAtGateway });
	expect(sent(LOGGER_URL)).toBe(0);
	expect(
		await page.evaluate(() => {
			window.__scriptFiles.dispose();
			const { seen, librarySet } = window as {
				librarySet?: unknown;
				seen?: string[];
			};
			return {
				kept:
					Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')
						?.set === librarySet,
				sawLogger: seen?.includes('https://cdn.logrocket.io/logger-1.min.js'),
			};
		})
	).toEqual({ kept: true, sawLogger: true });
});
