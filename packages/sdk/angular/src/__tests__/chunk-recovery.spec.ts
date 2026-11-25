/**
 * A consent chunk that failed to download loads on the page's next try.
 *
 * Chromium before 156 and Firefox before 155 keep a failed module fetch for
 * the life of the document, so a later `import()` of the chunk's URL fails
 * at once without a request. Each loader goes through `importChunk`, which
 * loads the chunk again from the URL the error names, with `inth-retry=<n>`
 * added. Every other browser fetches the chunk again on a new `import()`,
 * so each loader must import again on every call, never keeping a rejected
 * promise.
 *
 * jsdom has no module map, and Vitest replaces the error a mocked module
 * throws with its own. So a browser's failed `import()` is the loader's
 * `load` rejecting with the browser's error, before it imports anything,
 * and `setChunkImportForTest` stands in for the browser's retry. A chunk
 * that fails with any error is a mocked module that throws once.
 */
import { TestBed } from '@angular/core/testing';
import type * as ImportChunk from '@inth/sdk/runtime/import-chunk';
import { setChunkImportForTest } from '@inth/sdk/runtime/import-chunk';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { OPT_OUT_CONFIRMATION_PANEL } from '../../consent-dialog/src/opt-out-confirmation';
import { IAB_CONSENT_DIALOG_BODY } from '../../iab/src/iab-consent-dialog';
import { CONSENT_ENGINE_MODULE } from '../lib/core/consent-manager';
import type * as EngineModule from '../lib/core/deferred/create-engine';
import type * as DialogModule from '../lib/dialog/dialog';
import { loadConsentDialogBody } from '../lib/dialog/load-panel-body';
import { OPT_IN_CONFIRMATION_PANEL } from '../lib/dialog/opt-in-confirmation';
import { PROMPT_LOADERS } from '../lib/prompt/prompt-loaders';

const chunks = vi.hoisted(() => {
	/** The error the next `importChunk` load rejects with, as a browser's. */
	const browser: { failNext: Error | undefined } = { failNext: undefined };
	/** The chunks whose next import throws, as a failed download. */
	const failNext = new Set<string>();
	/** How many times each chunk was imported, by chunk. */
	const loads = new Map<string, number>();
	const load = async function load<Module>(
		name: string,
		importActual: () => Promise<Module>
	): Promise<Module> {
		loads.set(name, (loads.get(name) ?? 0) + 1);
		if (failNext.delete(name)) {
			throw new Error('chunk failed');
		}
		return await importActual();
	};
	return { browser, failNext, load, loads };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when a chunk's `import()` fails in a browser that keeps the failure; jsdom has no module map, and Vitest replaces a mocked module's error with its own, which names no URL. The real `importChunk` runs; only the loader's first `load` rejects as the browser would.
vi.mock('@inth/sdk/runtime/import-chunk', async (importActual) => {
	const actual = await importActual<typeof ImportChunk>();
	return {
		...actual,
		importChunk: <Module, Value>(
			load: () => Promise<Module>,
			pick: (module: Module) => Value | undefined
		): Promise<Value> =>
			actual.importChunk(async () => {
				const error = chunks.browser.failNext;
				if (error) {
					chunks.browser.failNext = undefined;
					throw error;
				}
				return await load();
			}, pick),
	};
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when a chunk fails to load; nothing else can make a dynamic import reject. Each factory fails the loads a test asks for and returns the real module after that.
vi.mock('../lib/prompt/card-container', (importActual) =>
	chunks.load('card', importActual)
);
// oxlint-disable-next-line anti-slop/no-module-mocking -- As above.
vi.mock('../lib/dialog/dialog', (importActual) =>
	chunks.load('dialog', importActual)
);
// oxlint-disable-next-line anti-slop/no-module-mocking -- As above.
vi.mock('../../consent-dialog/src/opt-out-confirmation-panel', (importActual) =>
	chunks.load('opt-out', importActual)
);
// oxlint-disable-next-line anti-slop/no-module-mocking -- As above.
vi.mock('../../iab/src/iab-dialog-body', (importActual) =>
	chunks.load('iab-dialog', importActual)
);
// oxlint-disable-next-line anti-slop/no-module-mocking -- As above.
vi.mock('../lib/core/deferred/create-engine', (importActual) =>
	chunks.load('engine', importActual)
);

/** What Chromium rejects a failed `import()` of a chunk with. */
const failedImport = (url: string): TypeError =>
	new TypeError(`Failed to fetch dynamically imported module: ${url}`);

/**
 * A browser that keeps failed imports: the next chunk's `import()` fails
 * with `error`, and loading a URL again loads `module`. Returns the URLs
 * loaded again.
 */
const keepFailedImport = function keepFailedImport(
	error: Error,
	module: () => Promise<unknown>
): string[] {
	const urls: string[] = [];
	chunks.browser.failNext = error;
	setChunkImportForTest({
		importUrl: (url) => {
			urls.push(url);
			return module();
		},
		keepsFailedImports: () => true,
	});
	return urls;
};

afterEach(() => {
	setChunkImportForTest();
	chunks.browser.failNext = undefined;
	chunks.failNext.clear();
	TestBed.resetTestingModule();
});

describe('a consent chunk a browser keeps failed', () => {
	test('the Banner container loads from its URL with a retry query on the same try', async () => {
		const url = 'http://localhost/chunk-STRIP.js';
		const urls = keepFailedImport(
			failedImport(url),
			async () => await import('../lib/prompt/strip')
		);

		const container = await TestBed.inject(PROMPT_LOADERS).container('banner');

		const { BANNER_CONTAINER } = await import('../lib/prompt/strip');
		expect(container).toBe(BANNER_CONTAINER);
		expect(urls).toEqual([`${url}?inth-retry=1`]);
	});

	test('the Drawer container loads from its URL with a retry query on the same try', async () => {
		const url = 'http://localhost/chunk-DRAWER.js';
		const urls = keepFailedImport(
			failedImport(url),
			async () => await import('../lib/prompt/drawer-container')
		);

		const container = await TestBed.inject(PROMPT_LOADERS).container('drawer');

		const { DRAWER_CONTAINER } = await import('../lib/prompt/drawer-container');
		expect(container).toBe(DRAWER_CONTAINER);
		expect(urls).toEqual([`${url}?inth-retry=1`]);
	});

	test('the prompt surface loads from its URL with a retry query on the same try', async () => {
		const url = 'http://localhost/chunk-SURFACE.js';
		const urls = keepFailedImport(
			failedImport(url),
			async () => await import('../lib/prompt/prompt-surface')
		);

		const surface = await TestBed.inject(PROMPT_LOADERS).surface();

		const { PromptSurface } = await import('../lib/prompt/prompt-surface');
		expect(surface).toBe(PromptSurface);
		expect(urls).toEqual([`${url}?inth-retry=1`]);
	});

	test('the dialog body loads from its URL with a retry query on the same try', async () => {
		const url = 'http://localhost/chunk-DIALOG.js';
		const actual = await vi.importActual<typeof DialogModule>(
			'../lib/dialog/dialog'
		);
		const urls = keepFailedImport(failedImport(url), () =>
			Promise.resolve(actual)
		);

		await expect(loadConsentDialogBody()).resolves.toBe(
			actual.ConsentDialogBody
		);
		expect(urls).toEqual([`${url}?inth-retry=1`]);
	});

	test('the opt-in confirmation panel loads from its URL with a retry query on the same try', async () => {
		const url = 'http://localhost/chunk-OPTIN.js';
		const urls = keepFailedImport(
			failedImport(url),
			async () => await import('../lib/dialog/opt-in-confirmation-panel')
		);

		const panel = await TestBed.inject(OPT_IN_CONFIRMATION_PANEL)();

		const { OptInConfirmationPanel } =
			await import('../lib/dialog/opt-in-confirmation-panel');
		expect(panel).toBe(OptInConfirmationPanel);
		expect(urls).toEqual([`${url}?inth-retry=1`]);
	});

	test('the engine loads from its URL with a retry query on the same try', async () => {
		const url = 'http://localhost/chunk-ENGINE.js';
		const actual = await vi.importActual<typeof EngineModule>(
			'../lib/core/deferred/create-engine'
		);
		const urls = keepFailedImport(failedImport(url), () =>
			Promise.resolve(actual)
		);

		const engine = await TestBed.inject(CONSENT_ENGINE_MODULE)();

		expect(engine.createEngine).toBe(actual.createEngine);
		expect(urls).toEqual([`${url}?inth-retry=1`]);
	});

	test('a URL that exports the chunk under other names leaves the load failed', async () => {
		const error = failedImport('http://localhost/chunk-DIALOG.js');
		// The bundler exported the chunk's namespace under a renamed export.
		keepFailedImport(error, () => Promise.resolve({ t: {} }));

		await expect(loadConsentDialogBody()).rejects.toBe(error);
	});
});

describe('a consent chunk that failed to load', () => {
	test.each([
		[
			'the Card container',
			'card',
			async () => await TestBed.inject(PROMPT_LOADERS).container('card'),
		],
		['the dialog body', 'dialog', loadConsentDialogBody],
		[
			'the opt-out confirmation panel',
			'opt-out',
			async () => await TestBed.inject(OPT_OUT_CONFIRMATION_PANEL)(),
		],
		[
			'the IAB dialog body',
			'iab-dialog',
			async () => await TestBed.inject(IAB_CONSENT_DIALOG_BODY)(),
		],
		[
			'the engine',
			'engine',
			async () => await TestBed.inject(CONSENT_ENGINE_MODULE)(),
		],
	] as const)(
		'%s is imported again on the next try',
		async (_name, chunk, load) => {
			chunks.failNext.add(chunk);
			const before = chunks.loads.get(chunk) ?? 0;

			await expect(load()).rejects.toThrow();
			await expect(load()).resolves.toBeDefined();
			expect(chunks.loads.get(chunk)).toBe(before + 2);
		}
	);
});
