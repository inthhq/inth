/**
 * The learned engine preload: the shell records the scripts the engine's
 * import added, and the server's inline script preloads them on a later
 * visit of the same build only.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { ENGINE_CHUNKS_KEY, learnEngineChunks } from '../engine-preload';
import { ENGINE_PRELOAD_SCRIPT } from '../engine-preload-script';

const added: Element[] = [];

const addScript = (src: string, async: boolean): HTMLScriptElement => {
	const script = document.createElement('script');
	// A type the browser does not run, so nothing is fetched.
	script.type = 'text/plain';
	script.src = src;
	if (async) {
		script.setAttribute('async', '');
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
		});
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

	test('a failed import records nothing and still rejects', async () => {
		const failure = new Error('chunk failed');
		await expect(learnEngineChunks(() => Promise.reject(failure))).rejects.toBe(
			failure
		);
		expect(localStorage.getItem(ENGINE_CHUNKS_KEY)).toBeNull();
	});
});

describe('ENGINE_PRELOAD_SCRIPT', () => {
	const run = () => {
		// oxlint-disable-next-line no-new-func -- Runs the inline script's source, as the parser would.
		new Function(ENGINE_PRELOAD_SCRIPT)();
	};

	test('preloads the learned chunks for the same build', async () => {
		addScript('/_next/static/chunks/shell.js', true);
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return Promise.resolve();
		});
		await Promise.resolve();
		run();
		expect(preloads()).toEqual([
			new URL('/_next/static/chunks/engine-a.js', location.href).href,
		]);
		const link = document.head.querySelector('link[rel=preload][as=script]');
		expect(link?.getAttribute('fetchpriority')).toBe('low');
	});

	test('preloads nothing after a new build', async () => {
		const shell = addScript('/_next/static/chunks/shell.js', true);
		await learnEngineChunks(() => {
			addScript('/_next/static/chunks/engine-a.js', false);
			return Promise.resolve();
		});
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
