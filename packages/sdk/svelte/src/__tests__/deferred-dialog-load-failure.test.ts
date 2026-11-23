/**
 * A failed dialog import must not strand the visitor. The banner and the
 * trigger hide while the dialog is open, so the surface that opened it comes
 * back and a second open retries the import.
 */
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { resetDialogWarmingForTests } from '../lib/warm-dialog';
import DeferredDialogFixture from './fixtures/deferred-dialog-fixture.svelte';
import { testOffline } from './test-offline';

const chunk = vi.hoisted(() => ({ failures: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when the dialog's chunk fails to load. The factory fails the first load and returns the real module after that.
vi.mock('../lib/components/dialog/dialog.svelte', async (importOriginal) => {
	if (chunk.failures > 0) {
		chunk.failures -= 1;
		throw new Error('Failed to fetch dynamically imported module');
	}
	return await importOriginal();
});

const dialogLink = function dialogLink() {
	return document.querySelector<HTMLElement>(
		'[data-testid="consent-dialog-link"]'
	);
};

const banner = function banner() {
	return document.querySelector<HTMLElement>(
		'[data-testid="consent-banner-root"]'
	);
};

beforeEach(() => {
	window.localStorage.clear();
	resetDialogWarmingForTests();
});

test('a failed dialog import brings the banner back and a retry opens it', async () => {
	chunk.failures = 1;
	render(DeferredDialogFixture, {
		options: { mode: testOffline(), preloadDialog: 'intent' },
	});
	const link = await waitFor(() => {
		const button = dialogLink();
		expect(button).toBeInTheDocument();
		expect(banner()).toBeInTheDocument();
		return button as HTMLElement;
	});

	await fireEvent.click(link);

	// The import fails, so the banner comes back instead of nothing.
	await waitFor(() => {
		expect(chunk.failures).toBe(0);
		expect(banner()).toBeInTheDocument();
	});
	expect(
		document.querySelector('[data-testid="consent-dialog-card"]')
	).toBeNull();

	await fireEvent.click(link);

	await waitFor(() => {
		expect(
			document.querySelector('[data-testid="consent-dialog-card"]')
		).toBeInTheDocument();
	});
});
