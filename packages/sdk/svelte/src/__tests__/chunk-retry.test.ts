/**
 * Older Chromium and Firefox keep a failed `import()` for the life of the
 * page, so importing the same chunk again fails at once. The dialog and
 * the options load again from the URL the error names, with
 * `inth-retry=<n>` added, and show on that same try.
 */
import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import {
	CHUNK_RETRY_PARAM,
	setChunkImportForTest,
} from '@inth/sdk/runtime/import-chunk';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { ConsentManagerOptions } from '../lib/manager-options.model';
import { testing } from '../lib/testing';
import { resetDialogWarmingForTests } from '../lib/warm-dialog';
import Fixture from './fixtures/consent-surfaces-fixture.svelte';
import DeferredDialogFixture from './fixtures/deferred-dialog-fixture.svelte';
import { policyFixture } from './policy-fixture';
import { testOffline } from './test-offline';

const chunk = vi.hoisted(() => ({
	dialogFailures: 0,
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
	panelFailures: 0,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when the dialog's chunk fails to load. The factory fails the first load with the browser's error and returns the real module after that.
vi.mock('../lib/components/dialog/dialog.svelte', (importOriginal) => {
	if (chunk.dialogFailures > 0) {
		chunk.dialogFailures -= 1;
		return chunk.failedImport('http://localhost/assets/dialog.js');
	}
	return importOriginal();
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when the options' chunk fails to load. The factory fails the first load with the browser's error and returns the real module after that.
vi.mock('../lib/components/prompt/panel.svelte', (importOriginal) => {
	if (chunk.panelFailures > 0) {
		chunk.panelFailures -= 1;
		return chunk.failedImport('http://localhost/assets/panel.js');
	}
	return importOriginal();
});

/** The URLs loaded again, in order. */
let retried: string[] = [];

/** A browser that keeps failed imports, whose retry URL serves `module`. */
const keepFailedImports = function keepFailedImports(
	module: () => Promise<unknown>
): void {
	setChunkImportForTest({
		importUrl: (url) => {
			retried.push(url);
			return module();
		},
		keepsFailedImports: () => true,
	});
};

beforeEach(() => {
	window.localStorage.clear();
	resetDialogWarmingForTests();
	retried = [];
});

afterEach(() => {
	chunk.dialogFailures = 0;
	chunk.panelFailures = 0;
	setChunkImportForTest();
});

test('a dialog chunk the browser keeps failed opens from its retry URL on the same click', async () => {
	chunk.dialogFailures = 1;
	keepFailedImports(() =>
		vi.importActual('../lib/components/dialog/dialog.svelte')
	);
	render(DeferredDialogFixture, {
		options: { mode: testOffline(), preloadDialog: 'intent' },
	});
	const link = await waitFor(() => {
		const button = document.querySelector<HTMLElement>(
			'[data-testid="consent-dialog-link"]'
		);
		expect(button).toBeInTheDocument();
		return button as HTMLElement;
	});

	await fireEvent.click(link);

	await waitFor(() => {
		expect(
			document.querySelector('[data-testid="consent-dialog-card"]')
		).toBeInTheDocument();
	});
	expect(chunk.dialogFailures).toBe(0);
	expect(retried).toEqual([
		`http://localhost/assets/dialog.js?${CHUNK_RETRY_PARAM}=1`,
	]);
});

// The options load once per module: this test runs before the one that
// loads them.
test('a retry URL that does not export the component leaves the options empty', async () => {
	chunk.panelFailures = 1;
	keepFailedImports(() => Promise.resolve({ t: {} }));
	const probe: {
		snapshot: ConsentSnapshot | null;
		kernel: ConsentKernel | null;
	} = { kernel: null, snapshot: null };
	render(Fixture, {
		options: {
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-panel-chunk-renamed' }),
			presentation: {
				prompt: { container: { side: 'start', type: 'drawer' } },
			},
		} as ConsentManagerOptions,
		probe,
	});

	await waitFor(() => {
		expect(
			document.querySelector('[data-flow="all-in-one"]')
		).toBeInTheDocument();
		expect(retried).toHaveLength(1);
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect(
		document.querySelector('[data-testid="consent-banner-category-group"]')
	).toBeNull();
});

test('[BNR-14] an options chunk the browser keeps failed shows from its retry URL on the first load', async () => {
	chunk.panelFailures = 1;
	keepFailedImports(() =>
		vi.importActual('../lib/components/prompt/panel.svelte')
	);
	const probe: {
		snapshot: ConsentSnapshot | null;
		kernel: ConsentKernel | null;
	} = { kernel: null, snapshot: null };
	render(Fixture, {
		options: {
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-panel-chunk-retry' }),
			presentation: {
				prompt: { container: { side: 'start', type: 'drawer' } },
			},
		} as ConsentManagerOptions,
		probe,
	});

	await waitFor(() => {
		expect(
			document.querySelector('[data-testid="consent-banner-category-group"]')
		).toBeInTheDocument();
	});
	expect(chunk.panelFailures).toBe(0);
	expect(retried).toEqual([
		`http://localhost/assets/panel.js?${CHUNK_RETRY_PARAM}=1`,
	]);
});
