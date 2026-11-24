/**
 * Builds the fixture site and taps its banner in Chromium while one of the
 * consent chunks fails to download.
 *
 * Chromium keeps a failed module fetch for the life of the document, so
 * a later `import()` of the chunk fails without a request. Only a real
 * build shows it: the chunks are the bundler's, and other chunks import
 * them by their plain URL. The fixture's page is prerendered, so no
 * early-tap script holds the tap.
 *
 * The page must not reload itself to get past that: a reload throws away
 * what the visitor typed into the host page. The banner shows again, no
 * choice is recorded, and the next page load fetches the chunk again.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FIXTURE = fileURLToPath(
	new URL('../../test/fixtures/astro-7', import.meta.url)
);

// The CLI rather than `build()` from `astro`: under this suite's Vite
// config, `astro` resolves to its browser stub. The fixture's config loads
// the built `@inth/astro`, so run `build` before this file.
const ASTRO_CLI = join(
	dirname(createRequire(import.meta.url).resolve('astro/package.json')),
	'bin/astro.mjs'
);

const ENGINE = /\/_astro\/engine\.[^/]+\.js$/u;
const PROMPT = /\/_astro\/mount-prompt\.[^/]+\.js$/u;

const TYPES: Record<string, string> = {
	'.css': 'text/css',
	'.html': 'text/html',
	'.js': 'text/javascript',
};

interface Site {
	/** Each request's method and path, in order. */
	requests: string[];
	/** Answers the next request for a matching chunk with a 503. */
	failNext: (pattern: RegExp, times?: number) => void;
	/** Forgets the requests and the failures still to come. */
	reset: () => void;
	url: string;
}

let outDir = '';
let server: Server | undefined;
let browser: Browser | undefined;
let site: Site;

beforeAll(async () => {
	// Astro renames prerendered assets. Its output must share the source
	// filesystem; /tmp can be mounted separately in a linked worktree.
	const buildDir = join(FIXTURE, '.astro');
	await mkdir(buildDir, { recursive: true });
	outDir = await mkdtemp(join(buildDir, 'inth-recovery-'));
	await promisify(execFile)(
		process.execPath,
		[ASTRO_CLI, 'build', '--root', FIXTURE, '--outDir', outDir],
		{
			env: {
				...process.env,
				ASTRO_TELEMETRY_DISABLED: '1',
				INTH_ASTRO_CACHE_DIR: join(outDir, '.astro'),
				INTH_DEFERRED: '0',
				INTH_IAB: '0',
				INTH_UI: 'svelte',
				INTH_VITE_CACHE_DIR: join(outDir, '.vite'),
			},
		}
	);

	const requests: string[] = [];
	const failures: { pattern: RegExp; left: number }[] = [];
	server = createServer((request, response) => {
		const path = new URL(request.url ?? '/', 'http://site').pathname;
		requests.push(`${request.method} ${path}`);
		const failure = failures.find(
			({ left, pattern }) => left > 0 && pattern.test(path)
		);
		if (failure) {
			failure.left -= 1;
			response.writeHead(503);
			response.end();
			return;
		}
		const file = path.endsWith('/') ? `${path}index.html` : path;
		void (async () => {
			try {
				const body = await readFile(join(outDir, file));
				response.writeHead(200, {
					'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
				});
				response.end(request.method === 'HEAD' ? undefined : body);
			} catch {
				response.writeHead(404);
				response.end();
			}
		})();
	});
	await new Promise<void>((resolve) => {
		server?.listen(0, '127.0.0.1', resolve);
	});
	const { port } = server.address() as AddressInfo;
	site = {
		failNext(pattern, times = 1) {
			failures.push({ left: times, pattern });
		},
		requests,
		reset() {
			requests.length = 0;
			failures.length = 0;
		},
		url: `http://127.0.0.1:${port}/`,
	};
	browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await new Promise((resolve) => {
		server?.close(resolve);
	});
	if (outDir) {
		await rm(outDir, { force: true, recursive: true });
	}
});

/** The `inth` cookie's marketing grant, once the choice is stored. */
const marketing = async function marketing(page: Page): Promise<string> {
	const cookies = await page.context().cookies();
	const value = cookies.find(({ name }) => name === 'inth')?.value ?? '';
	return /(?:^|&)mk=(?<granted>[01])/u.exec(value)?.groups?.granted ?? '';
};

const gets = (pattern: RegExp): number =>
	site.requests.filter(
		(entry) => entry.startsWith('GET ') && pattern.test(entry.slice(4))
	).length;

/** The page's consent client, as the banner left it. */
const consent = (page: Page) =>
	page.evaluate(() => {
		const client = (
			window as unknown as {
				__inthAstro?: {
					getConsent: () => {
						activeUI: string;
						effectivePermissions: Record<string, boolean>;
						explicitChoice: unknown;
					};
				};
			}
		).__inthAstro;
		const snapshot = client?.getConsent();
		return {
			activeUI: snapshot?.activeUI,
			chosen: Boolean(snapshot?.explicitChoice),
			marketing: snapshot?.effectivePermissions.marketing,
		};
	});

/**
 * Open the page, type a draft into a field on it, tap Accept, and tap it
 * again once the banner shows again. Resolves the page once the second
 * tap's retry failed.
 */
const acceptTwice = async function acceptTwice(
	prepare?: (page: Page) => Promise<void>
): Promise<Page> {
	const page = await (browser as Browser).newPage();
	let warned = 0;
	page.on('console', (message) => {
		if (/consent (?:engine|banner) failed to load/u.test(message.text())) {
			warned += 1;
		}
	});
	await prepare?.(page);
	await page.goto(site.url);
	// A host page's form, with a draft the visitor has not sent.
	await page.evaluate(() => {
		const field = document.createElement('textarea');
		field.id = 'draft';
		document.body.append(field);
	});
	await page.fill('#draft', 'unsaved draft');
	const accept = page.getByTestId('consent-banner-accept-button');
	await accept.click();
	await expect.poll(() => warned, { timeout: 10_000 }).toBeGreaterThan(0);
	await expect.poll(() => accept.isVisible(), { timeout: 10_000 }).toBe(true);
	await page.waitForTimeout(500);
	const before = warned;
	await accept.click();
	// The tap retried the load, which Chromium failed again at once.
	await expect.poll(() => warned, { timeout: 10_000 }).toBeGreaterThan(before);
	await page.waitForTimeout(500);
	return page;
};

/**
 * The page is the one the visitor typed into, with the banner back, no
 * choice recorded and every gate closed.
 */
const leftInPlace = async function leftInPlace(page: Page): Promise<void> {
	expect(site.requests.filter((entry) => entry === 'GET /')).toHaveLength(1);
	expect(await page.inputValue('#draft')).toBe('unsaved draft');
	expect(
		await page.getByTestId('consent-banner-accept-button').isVisible()
	).toBe(true);
	expect(await marketing(page)).toBe('');
	expect(await consent(page)).toEqual({
		activeUI: 'banner',
		chosen: false,
		marketing: false,
	});
	expect(
		await page.evaluate(() =>
			Object.keys(sessionStorage).filter((key) => key.startsWith('inth:'))
		)
	).toEqual([]);
};

describe('a consent chunk that fails to download once', () => {
	it('leaves the page in place after the engine chunk answered 503, and records a tap after the next load', async () => {
		site.reset();
		site.failNext(ENGINE);
		const page = await acceptTwice();
		await leftInPlace(page);
		// Chromium sent no request for the retry.
		expect(gets(ENGINE)).toBe(1);

		// The next page load fetches the chunk again.
		await page.reload();
		await page.getByTestId('consent-banner-accept-button').click();
		await expect.poll(() => marketing(page), { timeout: 10_000 }).toBe('1');
		await page.close();
	}, 60_000);

	it('leaves the page in place after the engine chunk failed offline', async () => {
		site.reset();
		let dropped = false;
		const page = await acceptTwice(async (opened) => {
			await opened.route(ENGINE, async (route) => {
				if (!dropped) {
					dropped = true;
					await route.abort('internetdisconnected');
					return;
				}
				await route.continue();
			});
		});
		expect(dropped).toBe(true);
		await leftInPlace(page);
		await page.close();
	}, 60_000);

	it('leaves the page in place after the prompt chunk answered 503', async () => {
		site.reset();
		site.failNext(PROMPT);
		const page = await acceptTwice();
		await leftInPlace(page);
		expect(gets(PROMPT)).toBe(1);
		await page.close();
	}, 60_000);

	it('leaves the page in place while the engine chunk keeps failing', async () => {
		site.reset();
		site.failNext(ENGINE, 100);
		const page = await acceptTwice();
		await leftInPlace(page);
		expect(gets(ENGINE)).toBe(1);
		await page.close();
	}, 60_000);
});
