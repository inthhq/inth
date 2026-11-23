/**
 * The consent dialog under a controlled `open` while its chunk is
 * still loading. The chunk's import waits on a gate this file opens, so the
 * consent manager shows the dialog before it can render.
 */
import type { ConsentSnapshot } from '@inth/sdk/engine';
import { render, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { ConsentManagerOptions } from '../lib/consent-manager-options.model';
import { testing } from '../lib/testing';
import Fixture from './fixtures/consent-surfaces-fixture.svelte';
import { policyFixture } from './policy-fixture';

const gate = vi.hoisted(() => {
	let release: () => void = () => undefined;
	const loaded = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { loaded, release: () => release() };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens while the dialog's chunk loads. The factory returns the real module once this file opens the gate.
vi.mock('../lib/components/dialog/dialog.svelte', async (importOriginal) => {
	await gate.loaded;
	return await importOriginal();
});

const $ = (testId: string) =>
	document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	gate.release();
});

test('[PERM-01] a controlled open turning false before the dialog loads closes it, and the banner comes back', async () => {
	const open = writable(true);
	const probe: { snapshot: ConsentSnapshot | null } = { snapshot: null };
	render(Fixture, {
		dialog: true,
		open,
		options: {
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pcd-pending-chunk' }),
			presentation: {
				prompt: { container: { type: 'card' } },
			},
		} as ConsentManagerOptions,
		probe,
	});
	// The consent manager hands over to the dialog, whose chunk still loads.
	await waitFor(() => expect(probe.snapshot?.activeUI).toBe('dialog'));
	expect($('consent-dialog-card')).toBeNull();
	expect($('consent-banner-root')).toBeNull();

	open.set(false);
	await waitFor(() => expect(probe.snapshot?.activeUI).toBe('banner'));
	await waitFor(() => expect($('consent-banner-root')).toBeInTheDocument());

	// Once the chunk arrives, the closed dialog stays closed.
	gate.release();
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	expect($('consent-dialog-card')).toBeNull();
	expect(probe.snapshot?.activeUI).toBe('banner');
});
