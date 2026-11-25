import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, test } from 'vite-plus/test';

import type { ConsentManagerOptions } from '../lib/manager-options.model';
import Fixture from './fixtures/dialog-control-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const ROOT = '[data-testid="consent-dialog-root"]';
const query = (selector: string) => document.querySelector(selector);

const options = {
	disableAnimation: true,
	mode: transportMode({}),
	persistence: false,
	prefetch: policyFixture(),
} as ConsentManagerOptions;

const settle = async () => {
	await tick();
	await new Promise((resolve) => {
		setTimeout(resolve, 20);
	});
	await tick();
};

describe('ConsentDialog open prop', () => {
	test('Escape closes a dialog `open` asked for, and it stays closed until `open` asks again', async () => {
		const result = render(Fixture, { open: true, options });
		await waitFor(() => expect(query(ROOT)).not.toBeNull());

		await fireEvent.keyDown(query(ROOT) as HTMLElement, { key: 'Escape' });
		await settle();

		// Escape closes it through the consent manager, as Close does.
		await waitFor(() => expect(query(ROOT)).toBeNull());
		expect(query('[data-testid="active-ui"]')?.textContent).not.toBe('dialog');

		await result.rerender({ open: false, options });
		await settle();
		expect(query(ROOT)).toBeNull();
		await result.rerender({ open: true, options });

		await waitFor(() => expect(query(ROOT)).not.toBeNull());
	});

	test('a dialog held open by `open` closes when `open` turns false', async () => {
		const result = render(Fixture, { open: true, options });
		await waitFor(() => expect(query(ROOT)).not.toBeNull());

		await result.rerender({ open: false, options });

		await waitFor(() => expect(query(ROOT)).toBeNull());
	});

	test('without `open`, Escape closes the dialog back to the owed banner', async () => {
		render(Fixture, { options });
		await fireEvent.click(query('[data-testid="open-dialog"]') as HTMLElement);
		await waitFor(() => expect(query(ROOT)).not.toBeNull());

		await fireEvent.keyDown(query(ROOT) as HTMLElement, { key: 'Escape' });

		await waitFor(() => expect(query(ROOT)).toBeNull());
		// The fixture's policy still owes a choice.
		expect(query('[data-testid="active-ui"]')?.textContent).toBe('banner');
	});
});
