import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import { IABConsentDialog } from '@inth/angular/iab';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	bootHarnessTest,
	iabTestOptions,
	resetHarnessTest,
	waitForHarness,
} from './__tests__/harness-test-bed';
import { IABConsentDialogHarness } from './iab-consent-dialog-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-iab-dialog-host',
	template: '<c15t-iab-consent-dialog />',
})
class IABDialogHost {}

const STORAGE = 'Store and/or access information on a device';

const openDialog = async () => {
	const booted = await bootHarnessTest(IABDialogHost, iabTestOptions());
	const consent = TestBed.inject(ConsentManager);
	consent.setActiveUI('dialog');
	// The IAB module and vendor list load outside what `whenStable` tracks.
	const dialog = await waitForHarness(() =>
		booted.loader.getHarnessOrNull(IABConsentDialogHarness)
	);
	return { ...booted, consent, dialog };
};

afterEach(resetHarnessTest);

describe('IABConsentDialogHarness', () => {
	test('saves one purpose from its switch', async () => {
		const { consent, dialog, loader } = await openDialog();

		expect(await dialog.getTitle()).not.toBe('');
		expect(await dialog.getDescription()).not.toBe('');
		expect(await dialog.getSelectedTab()).toBe('purposes');
		const [storage] = await dialog.getSwitches({ label: STORAGE });
		expect(storage).toBeDefined();
		expect(await storage?.isChecked()).toBe(false);

		await storage?.check();
		await dialog.save();

		// The TC string is encoded after the click returns.
		await vi.waitFor(() =>
			expect(consent.iab()?.authority?.tcString).toBeTruthy()
		);
		expect(consent.iab()?.purposeConsents[1]).toBe(true);
		expect(consent.iab()?.purposeConsents[2]).not.toBe(true);
		expect(await loader.getHarnessOrNull(IABConsentDialogHarness)).toBeNull();
	});

	test('switches tabs', async () => {
		const { dialog } = await openDialog();

		await dialog.selectTab('vendors');

		expect(await dialog.getSelectedTab()).toBe('vendors');
	});

	test('returns only the switches of the tab that shows', async () => {
		const { dialog, fixture } = await openDialog();
		const purposes = (await dialog.getSwitches()).length;
		expect(purposes).toBeGreaterThan(0);

		await dialog.selectTab('vendors');
		await dialog.selectTab('purposes');
		await fixture.whenStable();

		// Both panels stay rendered once visited; the hidden one is out.
		expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
		expect(await dialog.getSwitches()).toHaveLength(purposes);
	});

	test('accepts and rejects every purpose', async () => {
		const accepted = await openDialog();
		await accepted.dialog.acceptAll();
		expect(accepted.consent.iab()?.purposeConsents[2]).toBe(true);
		resetHarnessTest();

		const rejected = await openDialog();
		await rejected.dialog.rejectAll();
		// The TC string is encoded after the click returns.
		await vi.waitFor(() =>
			expect(rejected.consent.iab()?.authority?.tcString).toBeTruthy()
		);
		expect(rejected.consent.iab()?.purposeConsents[2]).not.toBe(true);
	});

	test('closes without recording a choice', async () => {
		const { consent, dialog, loader } = await openDialog();

		await dialog.close();

		expect(consent.activeUI()).not.toBe('dialog');
		expect(consent.iab()?.authority ?? null).toBeNull();
		expect(await loader.getHarnessOrNull(IABConsentDialogHarness)).toBeNull();
	});
});
