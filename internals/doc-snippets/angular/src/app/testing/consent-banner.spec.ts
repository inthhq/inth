import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentBanner, ConsentManager, provideC15t } from '@c15t/angular';
import { ConsentDialog } from '@c15t/angular/consent-dialog';
// #region docs:harness-banner-test title="src/app/consent-banner.spec.ts"
import { testing } from '@c15t/angular/testing';
import {
	ConsentBannerHarness,
	ConsentDialogHarness,
} from '@c15t/angular/testing';
import { beforeEach, describe, expect, it } from 'vitest';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'app-consent-test-host',
	template: '<c15t-consent-banner /><c15t-consent-dialog />',
})
class ConsentTestHost {}

describe('consent banner', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					consentCategories: ['necessary', 'measurement', 'marketing'],
					// Tests start with no stored choice and no motion.
					disableAnimation: true,
					// Nothing leaves the test: policies and choices stay in memory.
					mode: testing({
						policy: [
							{
								id: 'test-opt-in',
								match: { fallback: true, isDefault: true },
								model: 'opt-in',
								prompt: 'choice',
							},
						],
					}),
					persistence: false,
				}),
			],
		});
	});

	it('records Accept all and closes the banner', async () => {
		const fixture = TestBed.createComponent(ConsentTestHost);
		// Let the consent runtime start and pick the banner.
		await fixture.whenStable();
		// The banner renders into <body>, outside the fixture.
		const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
		const consent = TestBed.inject(ConsentManager);

		const banner = await loader.getHarness(ConsentBannerHarness);
		await banner.acceptAll();

		expect(consent.has('marketing')).toBe(true);
		expect(await loader.getHarnessOrNull(ConsentBannerHarness)).toBeNull();
	});

	it('saves one category from the dialog', async () => {
		const fixture = TestBed.createComponent(ConsentTestHost);
		await fixture.whenStable();
		const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
		const consent = TestBed.inject(ConsentManager);

		await (await loader.getHarness(ConsentBannerHarness)).openPreferences();
		const dialog = await loader.getHarness(ConsentDialogHarness);
		const widget = await dialog.getWidget();
		await widget.setCategory('measurement', true);
		await dialog.save();

		expect(consent.has('measurement')).toBe(true);
		expect(consent.has('marketing')).toBe(false);
	});
});
// #endregion docs:harness-banner-test
