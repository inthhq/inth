import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import { IABConsentBanner, IABConsentDialog } from '@inth/angular/iab';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	bootHarnessTest,
	iabTestOptions,
	resetHarnessTest,
	waitForHarness,
} from './__tests__/harness-test-bed';
import { IABConsentBannerHarness } from './iab-consent-banner-harness';
import { IABConsentDialogHarness } from './iab-consent-dialog-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentBanner, IABConsentDialog],
	selector: 'test-iab-banner-host',
	template: '<inth-iab-consent-banner /><inth-iab-consent-dialog />',
})
class IABBannerHost {}

const bootBanner = async () => {
	const booted = await bootHarnessTest(IABBannerHost, iabTestOptions());
	// The IAB module and vendor list load outside what `whenStable` tracks.
	const banner = await waitForHarness(() =>
		booted.loader.getHarnessOrNull(IABConsentBannerHarness)
	);
	return { ...booted, banner, consent: TestBed.inject(ConsentManager) };
};

afterEach(resetHarnessTest);

describe('IABConsentBannerHarness', () => {
	test('reads the banner and accepts every purpose', async () => {
		const { banner, consent, loader } = await bootBanner();

		expect(await banner.getTitle()).not.toBe('');
		expect(await banner.getDescription()).not.toBe('');
		expect((await banner.getPurposes()).length).toBeGreaterThan(0);
		expect(
			await loader.getHarnessOrNull(
				IABConsentBannerHarness.with({ title: await banner.getTitle() })
			)
		).not.toBeNull();

		await banner.acceptAll();

		// The TC string is encoded after the click returns.
		await vi.waitFor(() =>
			expect(consent.iab()?.authority?.tcString).toBeTruthy()
		);
		expect(consent.iab()?.purposeConsents[1]).toBe(true);
		expect(await loader.getHarnessOrNull(IABConsentBannerHarness)).toBeNull();
	});

	test('rejects every purpose', async () => {
		const { banner, consent, loader } = await bootBanner();

		await banner.rejectAll();

		// The TC string is encoded after the click returns.
		await vi.waitFor(() =>
			expect(consent.iab()?.authority?.tcString).toBeTruthy()
		);
		expect(consent.iab()?.purposeConsents[1]).not.toBe(true);
		expect(await loader.getHarnessOrNull(IABConsentBannerHarness)).toBeNull();
	});

	test('opens the dialog on the purposes or the vendors tab', async () => {
		const purposes = await bootBanner();
		await purposes.banner.openPreferences();
		const dialog = await purposes.loader.getHarness(IABConsentDialogHarness);
		expect(await dialog.getSelectedTab()).toBe('purposes');
		expect(purposes.consent.iab()?.authority ?? null).toBeNull();
		resetHarnessTest();

		const vendors = await bootBanner();
		await vendors.banner.openVendors();
		const vendorDialog = await vendors.loader.getHarness(
			IABConsentDialogHarness
		);
		expect(await vendorDialog.getSelectedTab()).toBe('vendors');
	});
});
