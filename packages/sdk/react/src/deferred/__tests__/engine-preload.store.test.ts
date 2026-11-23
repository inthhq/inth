/**
 * The learned engine preload: the shell records the bundler's scripts the
 * engine's import added, and the server's inline script preloads them on a
 * later visit of the same build only.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { ENGINE_CHUNKS_KEY, learnEngineChunks } from '../engine-preload.store';
import { enginePreloadScript } from '../engine-preload-script';

const CHUNKS = '/_next/static/';

/** A consent-gated vendor script, which Inth may start while the engine loads. */
const VENDOR = 'https://vendor.example/pixel.js';

const added: Element[] = [];

const addScript = (
	src: string,
	async: boolean,
	attribute: 'async' | 'defer' = 'async'
): HTMLScriptElement => {
	const script = document.createElement('script');
	// A type the browser does not run, so nothing is fetched.
	script.type = 'text/plain';
	script.src = src;
	if (async) {
		script.setAttribute(attribute, '');
	}
	document.head.append(script);
	added.push(script);
	return script;
};

const preloads = () =>
	Array.from(
		document.head.querySelectorAll<HTMLLinkElement>(
			'link[rel=preload][as=script]'
		),
		(link) => link.href
	);

afterEach(() => {
	for (const element of added.splice(0)) {
		element.remove();
	}
	for (const link of document.head.querySelectorAll('link[rel=preload]')) {
		link.remove();
	}
	localStorage.removeItem(ENGINE_CHUNKS_KEY);
});

describe('learnEngineChunks', () => {
	test("records the scripts the import added, keyed by the server's", async () => {
		addScript('/_next/static/chunks/shell.js', true);
		const engine = await learnEngineChunks(() => {
			// What the bundler does for a dynamic import.
			addScript('/_next/static/chunks/engine-a.js', false);
			addScript('/_next/static/chunks/engine-b.js', false);
			return Promise.resolve('engine');
		}, CHUNKS);
		expect(engine).toBe('engine');
		await Promise.resolve();
		const stored = JSON.parse(localStorage.getItem(ENGINE_CHUNKS_KEY) ?? '{}');
		expect(stored.u).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
			new URL('/_next/static/chunks/engine-b.js', location.href).href,
		]);
		expect(stored.k).toContain('/_next/static/chunks/shell.js');
		expect(stored.k).not.toContain('engine-a.js');
	});

	test("leaves out scripts that are not the bundler's, such as consent-gated ones", async () => {
		addScript('/_next/static/chunks/shell.js', true);
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			// Inth starts granted vendor scripts while the engine loads.
			addScript(VENDOR, true);
			addScript(`${VENDOR}?from=/_next/static/`, true);
			return Promise.resolve();
		}, CHUNKS);
		await Promise.resolve();
		const stored = JSON.parse(localStorage.getItem(ENGINE_CHUNKS_KEY) ?? '{}');
		expect(stored.u).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
	});

	test('leaves out a gated script served from the chunk base, started while the import is pending', async () => {
		addScript('/_next/static/chunks/shell.js', true);
		let finish: () => void = () => undefined;
		const learning = learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return new Promise<void>((resolve) => {
				finish = resolve;
			});
		}, CHUNKS);
		// Inth starts a granted script, bundled as an asset, in a later task.
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		addScript('/_next/static/media/pixel.js', true);
		finish();
		await learning;
		await Promise.resolve();
		const stored = JSON.parse(localStorage.getItem(ENGINE_CHUNKS_KEY) ?? '{}');
		expect(stored.u).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
	});

	test('a failed import records nothing and still rejects', async () => {
		const failure = new Error('chunk failed');
		await expect(
			learnEngineChunks(() => Promise.reject(failure), CHUNKS)
		).rejects.toBe(failure);
		expect(localStorage.getItem(ENGINE_CHUNKS_KEY)).toBeNull();
	});
});

describe('enginePreloadScript', () => {
	const run = () => {
		// oxlint-disable-next-line no-new-func -- Runs the inline script's source, as the parser would.
		new Function(enginePreloadScript(CHUNKS))();
	};

	test.each([
		['finds the choice stale', () => false, 1],
		['finds the choice current', () => true, 0],
		['did not run', undefined, 1],
		['belongs to another render', 'another-render', 1],
	] as [string, (() => boolean) | string | undefined, number][])(
		'a preload that follows the stored-choice check runs when the check %s',
		async (_case, verifier, expected) => {
			addScript('/_next/static/chunks/shell.js', true);
			await learnEngineChunks(() => {
				addScript('/_next/static/chunks/engine-a.js', false);
				return Promise.resolve();
			}, CHUNKS);
			const host = window as unknown as Record<string, unknown>;
			host.__inthRender =
				typeof verifier === 'string'
					? { current: () => true, id: verifier, starts: {} }
					: { current: verifier, id: 'this-render', starts: {} };
			try {
				// oxlint-disable-next-line no-new-func -- Runs the inline script's source, as the parser would.
				new Function(enginePreloadScript(CHUNKS, 'this-render'))();
				expect(
					document.head.querySelectorAll('link[rel="preload"]')
				).toHaveLength(expected);
			} finally {
				Reflect.deleteProperty(host, '__inthRender');
			}
		}
	);

	test('preloads the learned chunks for the same build', async () => {
		addScript('/_next/static/chunks/shell.js', true);
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return Promise.resolve();
		}, CHUNKS);
		await Promise.resolve();
		run();
		expect(preloads()).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
		const link = document.head.querySelector('link[rel=preload][as=script]');
		expect(link?.getAttribute('fetchpriority')).toBe('low');
	});

	test('preloads on every visit, whatever vendor scripts the last one started', async () => {
		addScript('/_next/static/chunks/shell.js', true);
		// The last visit learned once the server-started vendor script was
		// in <head>; this visit's inline script runs before it is.
		const vendor = addScript(VENDOR, true);
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return Promise.resolve();
		}, CHUNKS);
		await Promise.resolve();
		vendor.remove();
		run();
		expect(preloads()).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
	});

	test('never preloads a script an earlier version recorded outside the chunk path', () => {
		addScript('/_next/static/chunks/shell.js', true);
		localStorage.setItem(
			ENGINE_CHUNKS_KEY,
			JSON.stringify({
				k: new URL('/_next/static/chunks/shell.js', location.href).href,
				u: [VENDOR, '/_next/static/chunks/engine-a.js'],
			})
		);
		run();
		expect(preloads()).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
	});

	test("never preloads a script outside the page's own chunk base", () => {
		addScript('/_next/static/chunks/shell.js', true);
		localStorage.setItem(
			ENGINE_CHUNKS_KEY,
			JSON.stringify({
				k: new URL('/_next/static/chunks/shell.js', location.href).href,
				u: [
					// A vendor served by another Next.js site.
					'https://vendor.example/_next/static/chunks/pixel.js',
					// The chunk path only in the query.
					`${VENDOR}?from=/_next/static/`,
					'/_next/static/chunks/engine-a.js',
				],
			})
		);
		run();
		expect(preloads()).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
	});

	test('preloads for the Pages Router, whose chunks are deferred', async () => {
		addScript('/_next/static/chunks/shell.js', true, 'defer');
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return Promise.resolve();
		}, CHUNKS);
		await Promise.resolve();
		run();
		expect(preloads()).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
	});

	test('preloads nothing after a new build', async () => {
		const shell = addScript('/_next/static/chunks/shell.js', true);
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return Promise.resolve();
		}, CHUNKS);
		await Promise.resolve();
		shell.src = '/_next/static/chunks/shell-next-build.js';
		run();
		expect(preloads()).toEqual([]);
	});

	test('preloads nothing without a list, or with an unreadable one', () => {
		run();
		localStorage.setItem(ENGINE_CHUNKS_KEY, '{not json');
		run();
		expect(preloads()).toEqual([]);
	});
});
