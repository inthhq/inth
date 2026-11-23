/**
 * The consent prompt loads its options on demand, so a failed load of
 * them must not leave them empty for good: the next
 * trigger, here the prompt showing again, loads them again.
 */
import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { testing } from '../lib/testing';
import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/consent-surfaces-fixture.svelte';
import { policyFixture } from './policy-fixture';

const chunk = vi.hoisted(() => ({ failures: 0, loads: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when the options' chunk fails to load. The factory fails the first load and returns the real module after that.
vi.mock('../lib/components/prompt/panel.svelte', async (importOriginal) => {
	chunk.loads += 1;
	if (chunk.failures > 0) {
		chunk.failures -= 1;
		throw new Error('Failed to fetch dynamically imported module');
	}
	return await importOriginal();
});

const group = () =>
	document.querySelector('[data-testid="consent-banner-category-group"]');

beforeEach(() => {
	window.localStorage.clear();
});

test('[BNR-14] a failed options load in a side Drawer loads again when the prompt shows again', async () => {
	chunk.failures = 1;
	const probe: {
		snapshot: ConsentSnapshot | null;
		kernel: ConsentKernel | null;
	} = { kernel: null, snapshot: null };
	render(Fixture, {
		options: {
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-panel-retry' }),
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
		expect(chunk.failures).toBe(0);
	});
	// The failed load leaves the options empty.
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect(group()).toBeNull();
	const kernel = probe.kernel as ConsentKernel | null;
	if (!kernel) {
		throw new Error('No kernel');
	}

	// The visitor opens the dialog and closes it: the prompt shows again.
	showConsentSurface(kernel, 'dialog');
	await waitFor(() => expect(probe.snapshot?.activeUI).toBe('dialog'));
	showConsentSurface(kernel, 'none');
	await waitFor(() => expect(probe.snapshot?.activeUI).toBe('banner'));

	await waitFor(() => expect(group()).toBeInTheDocument());
	expect(chunk.loads).toBe(2);
});
