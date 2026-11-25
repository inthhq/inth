/**
 * `importChunk`: a consent chunk that failed loads on the next try, in a
 * browser that keeps failed imports too (`runtime/import-chunk.ts`).
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import {
	importChunk,
	keepsFailedImports,
	setChunkImportForTest,
} from '../import-chunk';

const URL_ = 'https://site.example/_astro/prompt.abc123.js';
const chromiumFailure = () =>
	new TypeError(`Failed to fetch dynamically imported module: ${URL_}`);
const firefoxFailure = () =>
	new TypeError(`error loading dynamically imported module: ${URL_}`);
const webkitFailure = () => new TypeError('Importing a module script failed.');

const prompt = { mountPrompt: () => 'mounted' };

afterEach(() => {
	setChunkImportForTest();
});

describe('keepsFailedImports', () => {
	it.each([
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
			true,
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0',
			true,
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
			false,
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36',
			true,
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:154.0) Gecko/20100101 Firefox/154.0',
			true,
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0',
			false,
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
			false,
		],
	])('%s: %s', (userAgent, keeps) => {
		expect(keepsFailedImports(userAgent)).toBe(keeps);
	});
});

describe('importChunk', () => {
	it('loads again on every try, never keeping a failure', async () => {
		const load = vi
			.fn<() => Promise<typeof prompt>>()
			.mockRejectedValueOnce(webkitFailure())
			.mockResolvedValueOnce(prompt);
		await expect(importChunk(load, (m) => m.mountPrompt)).rejects.toThrow(
			'Importing a module script failed.'
		);
		await expect(importChunk(load, (m) => m.mountPrompt)).resolves.toBe(
			prompt.mountPrompt
		);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it.each([
		['Chromium', chromiumFailure],
		['Firefox', firefoxFailure],
	])(
		'loads the chunk again from a URL of its own where %s keeps the failure',
		async (_browser, failure) => {
			const importUrl = vi.fn().mockResolvedValue(prompt);
			setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
			const load = vi.fn().mockRejectedValue(failure());
			await expect(importChunk(load, (m) => m.mountPrompt)).resolves.toBe(
				prompt.mountPrompt
			);
			expect(importUrl).toHaveBeenCalledWith(`${URL_}?inth-retry=1`);
		}
	);

	it('reuses the chunk it loaded again, so no chunk runs twice', async () => {
		const importUrl = vi.fn().mockResolvedValue(prompt);
		setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
		const load = vi.fn().mockRejectedValue(chromiumFailure());
		await importChunk(load, (m) => m.mountPrompt);
		await importChunk(load, (m) => m.mountPrompt);
		expect(load).toHaveBeenCalledTimes(2);
		expect(importUrl).toHaveBeenCalledTimes(1);
	});

	it('asks at a new URL after a retry failed too', async () => {
		const importUrl = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('offline'))
			.mockResolvedValueOnce(prompt);
		setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
		const load = vi.fn().mockRejectedValue(chromiumFailure());
		// The caller sees the chunk's own error, not the retry's.
		await expect(importChunk(load, (m) => m.mountPrompt)).rejects.toThrow(
			/dynamically imported module/u
		);
		await expect(importChunk(load, (m) => m.mountPrompt)).resolves.toBe(
			prompt.mountPrompt
		);
		expect(importUrl.mock.calls).toEqual([
			[`${URL_}?inth-retry=1`],
			[`${URL_}?inth-retry=2`],
		]);
	});

	it('keeps the failure when the URL exports the chunk under other names', async () => {
		// Rollup merged the module into a chunk and renamed its exports.
		const importUrl = vi.fn().mockResolvedValue({ a: prompt });
		setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
		const load = vi.fn().mockRejectedValue(chromiumFailure());
		await expect(importChunk(load, (m) => m.mountPrompt)).rejects.toThrow(
			/dynamically imported module/u
		);
	});

	it('loads nothing again where the browser fetches a failed module again', async () => {
		const importUrl = vi.fn().mockResolvedValue(prompt);
		setChunkImportForTest({ importUrl, keepsFailedImports: () => false });
		const load = vi.fn().mockRejectedValue(chromiumFailure());
		await expect(importChunk(load, (m) => m.mountPrompt)).rejects.toThrow(
			/dynamically imported module/u
		);
		expect(importUrl).not.toHaveBeenCalled();
	});

	it('leaves a failure that names no URL, such as webpack’s, to the next try', async () => {
		const importUrl = vi.fn().mockResolvedValue(prompt);
		setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
		const chunkLoadError = new Error(
			'Loading chunk 830 failed.\n(error: https://site.example/830.js)'
		);
		await expect(
			importChunk(
				() => Promise.reject(chunkLoadError),
				(m: typeof prompt) => m
			)
		).rejects.toBe(chunkLoadError);
		await expect(
			importChunk(
				() => Promise.reject(webkitFailure()),
				(m: typeof prompt) => m
			)
		).rejects.toThrow('Importing a module script failed.');
		expect(importUrl).not.toHaveBeenCalled();
	});
});
