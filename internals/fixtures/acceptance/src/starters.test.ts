// oxlint-disable no-loop-func -- Each sequential suite owns its browser context and request record.
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import type {
	Browser,
	BrowserContext,
	BrowserContextOptions,
	Page,
} from 'playwright';
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from 'vite-plus/test';

import {
	acceptButton,
	holdAppScripts,
	openBrowserContext,
	privacySettings,
	waitForConsentRuntime,
} from './browser';
import type { Requests } from './browser';
import { startApp } from './server';
import {
	hostedScriptURL,
	placeholderProjectUrl,
	selectedStarterTargets,
} from './starter-targets';
import type { StarterTarget } from './starter-targets';
import { exampleEnvironment } from './targets';

const repository = fileURLToPath(new URL('../../../..', import.meta.url));
const browserDist = join(repository, 'packages/sdk/browser/dist');

// What `@c15t/backend` serves on `/inth.js`: this checkout's full bundle
// behind the queued hosted config its script route prepends.
const hostedScript = async function hostedScript(): Promise<string> {
	const bundle = await readFile(join(browserDist, 'inth.js'), 'utf8');
	const config = JSON.stringify({
		mode: 'hosted',
		projectUrl: placeholderProjectUrl,
	});
	return `(function(c){window.inth=window.inth||[];Array.isArray(window.inth)?window.inth.unshift(["config",c]):window.inth.config(c)})(${config});\n${bundle}`;
};

// `inth.hosted.js`, `inth.commit.js`, `inth.records.js`, `inth.dialog.js`
// and `inth.manifests.js`, with or without the hash query the backend adds.
const scriptPartURL = new RegExp(
	`^${placeholderProjectUrl.replaceAll('.', '\\.')}/inth\\.(?:hosted|commit|records|dialog|manifests)\\.js(?:\\?.*)?$`,
	'u'
);

const startStarter = function startStarter(target: StarterTarget) {
	return startApp({
		build: target.build ?? ['run', 'build'],
		cwd: join(repository, target.directory),
		env: (projectUrl, port) => ({
			...exampleEnvironment(projectUrl, port),
			...target.env?.(projectUrl),
		}),
		host: target.host,
		id: target.id,
		readyPath: target.routes[0] ?? '/',
		start: target.start,
	});
};

for (const target of selectedStarterTargets()) {
	describe(target.id, () => {
		let server: Awaited<ReturnType<typeof startStarter>>;
		let browser: Browser;
		let context: BrowserContext | undefined;
		let page: Page;
		let requests: Requests;

		beforeAll(async () => {
			server = await startStarter(target);
			browser = await chromium.launch({ headless: true });
		});
		afterAll(async () => {
			await browser?.close();
			await server?.close();
		});
		afterEach(async (result) => {
			if (!context) {
				return;
			}
			if (result.task.result?.state === 'fail') {
				const directory = join('artifacts', 'starters', target.id);
				await mkdir(directory, { recursive: true });
				const filename = result.task.name.replace(/[^a-z0-9]+/giu, '-');
				await page.screenshot({
					fullPage: true,
					path: join(directory, `${filename}.png`),
				});
				await context.tracing.stop({
					path: join(directory, `${filename}.zip`),
				});
			} else {
				await context.tracing.stop();
			}
			await context.close();
			context = undefined;
		});

		const open = async function open(options: BrowserContextOptions = {}) {
			({ context, page, requests } = await openBrowserContext(
				browser,
				server.baseURL,
				server.projectUrl,
				false,
				options
			));
			if (target.placeholderBackend) {
				const pageOrigin = new URL(server.baseURL).origin;
				await context.route(`${placeholderProjectUrl}/**`, async (route) => {
					const { pathname, search } = new URL(route.request().url());
					const response = await route.fetch({
						url: `${server.projectUrl}${pathname}${search}`,
					});
					await route.fulfill({
						headers: {
							...response.headers(),
							'access-control-allow-credentials': 'true',
							'access-control-allow-origin': pageOrigin,
						},
						response,
					});
				});
			}
			// Registered after the placeholder proxy, so it takes precedence.
			await context.route(hostedScriptURL, async (route) => {
				await route.fulfill({
					body: await hostedScript(),
					contentType: 'text/javascript; charset=utf-8',
				});
			});
			// The files `inth.js` loads next, which the backend serves as built.
			await context.route(scriptPartURL, async (route) => {
				const file = new URL(route.request().url()).pathname.slice(1);
				await route.fulfill({
					body: await readFile(join(browserDist, file), 'utf8'),
					contentType: 'text/javascript; charset=utf-8',
				});
			});
			return context;
		};

		if (target.earlyInit) {
			// The plugin leaves the script out when a bundle still holds the
			// policy snapshot, so a chunking change could drop it from every
			// build. The app would still work, one round trip later.
			test('the inline script sends the only /init before the app loads', async () => {
				const scripts = await holdAppScripts(await open(), server.baseURL);
				let initRequests = 0;
				page.on('request', (request) => {
					if (new URL(request.url()).pathname.endsWith('/init')) {
						initRequests += 1;
					}
				});
				await page.goto(target.routes[0] ?? '/', { waitUntil: 'commit' });
				await expect.poll(() => initRequests).toBe(1);
				await expect.poll(() => scripts.held()).toBeGreaterThan(0);

				scripts.release();
				// `hosted()` answers its first init from the early response.
				await expect.poll(() => acceptButton(page).isVisible()).toBe(true);
				expect(initRequests).toBe(1);
				expect(requests.unexpected).toEqual([]);
			});
		}

		for (const route of target.routes) {
			if (target.serverRendered) {
				test(`${route}: the first HTML response has the banner`, async () => {
					await open({ javaScriptEnabled: false });
					await page.goto(route);
					expect(await acceptButton(page).isVisible()).toBe(true);
					expect(requests.unexpected).toEqual([]);
				});
			}

			test(`${route}: Accept persists across a reload`, async () => {
				await open();
				await page.goto(route);
				await expect.poll(() => acceptButton(page).isVisible()).toBe(true);
				await acceptButton(page).click();
				await expect.poll(() => acceptButton(page).isVisible()).toBe(false);
				// Hiding the banner precedes the deferred save.
				await expect
					.poll(() => page.evaluate(() => localStorage.getItem('inth')))
					.not.toBeNull();

				await page.reload({ waitUntil: 'networkidle' });
				await expect.poll(() => privacySettings(page).isVisible()).toBe(true);
				expect(await acceptButton(page).isVisible()).toBe(false);

				// The banner is gone, so the dialog is the preference dialog. Its
				// copy depends on the backend's translations.
				// A server-rendered control does nothing until hydration.
				if (target.serverRendered) {
					await waitForConsentRuntime(page);
				}
				await privacySettings(page).click();
				await expect
					.poll(() => page.getByRole('dialog').first().isVisible())
					.toBe(true);
				expect(requests.unexpected).toEqual([]);
			});
		}
	});
}
