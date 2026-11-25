/**
 * The deferred runtime's commit chunk, in a browser that keeps a failed
 * `import()` for the life of the page: the chunk loads again from the URL
 * the error names, with `inth-retry=<n>` added, and stores the choice
 * before the engine loads.
 */
import {
	CHUNK_RETRY_PARAM,
	setChunkImportForTest,
} from '@inth/sdk/runtime/import-chunk';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { createOwnedRuntime } from '../lib/create-owned-runtime';
import type { RootBoot } from '../lib/deferred/consent-boot.model';
import { createDeferredRuntime } from '../lib/deferred/create-deferred-runtime';
import type { EngineFactory } from '../lib/deferred/create-deferred-runtime';
import { runtimeOptionsFor } from '../lib/resolve-provider-options';
import type { ProviderOptionsInput } from '../lib/resolve-provider-options';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const chunk = vi.hoisted(() => ({
	/**
	 * A mock factory's result that fails the `import()` with the browser's
	 * own error. Vitest replaces an error the factory throws with one of its
	 * own, which names no URL; a `then` that throws reaches the importer
	 * unchanged.
	 */
	failedImport: (url: string) => ({
		// oxlint-disable-next-line unicorn/no-thenable -- Vitest awaits a factory's thenable result outside the wrapper it puts around a factory's errors.
		then(): never {
			throw new TypeError(
				`Failed to fetch dynamically imported module: ${url}`
			);
		},
	}),
	failures: 0,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when the commit chunk fails to load. The factory fails the first load with the browser's error and returns the real module after that.
vi.mock('@inth/sdk/surface-actions/early-commit', (importOriginal) => {
	if (chunk.failures > 0) {
		chunk.failures -= 1;
		return chunk.failedImport('http://localhost/assets/early-commit.js');
	}
	return importOriginal();
});

const mode = transportMode({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true as const }),
});

const disposers: (() => void)[] = [];

afterEach(() => {
	for (const dispose of disposers.splice(0)) {
		dispose();
	}
	chunk.failures = 0;
	setChunkImportForTest();
	localStorage.clear();
	(window as { __inthStarted?: unknown }).__inthStarted = undefined;
});

test('a commit chunk the browser keeps failed stores the choice from its retry URL before the engine loads', async () => {
	chunk.failures = 1;
	const retried: string[] = [];
	setChunkImportForTest({
		importUrl: (url) => {
			retried.push(url);
			return vi.importActual('@inth/sdk/surface-actions/early-commit');
		},
		keepsFailedImports: () => true,
	});
	const prefetch = policyFixture();
	const providerOptions: ProviderOptionsInput = {
		consentCategories: ['necessary', 'measurement', 'marketing'],
		prefetch,
		scripts: [],
	};
	const server = createOwnedRuntime(
		runtimeOptionsFor({ ...providerOptions, mode })
	);
	const boot: RootBoot = {
		d: 1,
		s: JSON.parse(JSON.stringify(server.kernel.getSnapshot())),
	};
	server.dispose();
	// The engine never loads: only the commit chunk can store the choice.
	const loadEngine = vi.fn(
		(): Promise<EngineFactory> =>
			new Promise<EngineFactory>(() => {
				// Never settles.
			})
	);
	const runtime = createDeferredRuntime({
		boot,
		loadEngine,
		options: () => providerOptions,
		schedule: () => () => undefined,
	});
	disposers.push(() => runtime.dispose());
	runtime.start();

	void runtime.kernel.commands.save('all', { uiSource: 'banner' });

	await vi.waitFor(() => {
		expect(JSON.parse(localStorage.getItem('inth') ?? 'null')).toMatchObject({
			categories: { marketing: { value: true } },
		});
	});
	expect(chunk.failures).toBe(0);
	expect(retried).toEqual([
		`http://localhost/assets/early-commit.js?${CHUNK_RETRY_PARAM}=1`,
	]);
});
