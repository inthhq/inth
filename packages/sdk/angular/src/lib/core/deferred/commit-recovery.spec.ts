/**
 * A tap before the engine completes its commit even when the commit chunk's
 * `import()` fails in a browser that keeps the failure (Chromium before
 * 156, Firefox before 155): the chunk loads again from the URL the error
 * names, with `inth-retry=<n>` added, on the same tap.
 *
 * jsdom has no module map, and Vitest replaces the error a mocked module
 * throws with its own. So the browser's failed `import()` is the loader's
 * `load` rejecting with the browser's error, before it imports anything,
 * and `setChunkImportForTest` stands in for the browser's retry.
 */
import type { ConsentSnapshot } from '@inth/sdk/engine';
import type * as ImportChunk from '@inth/sdk/runtime/import-chunk';
import { setChunkImportForTest } from '@inth/sdk/runtime/import-chunk';
import { pendingBootSnapshot } from '@inth/sdk/surface-state';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { createDeferredRuntime } from './create-deferred-runtime';

const browser = vi.hoisted(() => ({
	/** The error the next `importChunk` load rejects with, as a browser's. */
	failNext: undefined as Error | undefined,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when the commit chunk's `import()` fails in a browser that keeps the failure; jsdom has no module map, and Vitest replaces a mocked module's error with its own, which names no URL. The real `importChunk` runs; only the loader's first `load` rejects as the browser would.
vi.mock('@inth/sdk/runtime/import-chunk', async (importActual) => {
	const actual = await importActual<typeof ImportChunk>();
	return {
		...actual,
		importChunk: <Module, Value>(
			load: () => Promise<Module>,
			pick: (module: Module) => Value | undefined
		): Promise<Value> =>
			actual.importChunk(async () => {
				const error = browser.failNext;
				if (error) {
					browser.failNext = undefined;
					throw error;
				}
				return await load();
			}, pick),
	};
});

const banner = (): ConsentSnapshot =>
	({ ...pendingBootSnapshot({}), activeUI: 'banner' }) as ConsentSnapshot;

afterEach(() => {
	setChunkImportForTest();
	browser.failNext = undefined;
});

describe('the commit chunk a browser keeps failed', () => {
	test('loads from its URL with a retry query on the same tap', async () => {
		const url = 'http://localhost/chunk-COMMIT.js';
		browser.failNext = new TypeError(
			`Failed to fetch dynamically imported module: ${url}`
		);
		const actual = await import('@inth/sdk/surface-actions/early-commit');
		const completeCommit = vi.fn(actual.completeCommit);
		const urls: string[] = [];
		setChunkImportForTest({
			importUrl: (next) => {
				urls.push(next);
				return Promise.resolve({ ...actual, completeCommit });
			},
			keepsFailedImports: () => true,
		});
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: banner() },
			// The engine never arrives: only the commit path runs.
			loadEngine: () =>
				new Promise<never>(() => {
					/* pending */
				}),
			options: () => ({}),
			schedule: () => () => undefined,
		});
		runtime.start();

		// The save may wait for the engine, which the dispose below rejects.
		runtime.kernel.commands.save('all').catch(() => undefined);

		await vi.waitFor(() => {
			expect(completeCommit).toHaveBeenCalledOnce();
		});
		expect(urls).toEqual([`${url}?inth-retry=1`]);
		runtime.dispose();
	});
});
