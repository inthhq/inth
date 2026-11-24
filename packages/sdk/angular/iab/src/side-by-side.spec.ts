import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	CONSENT_DIALOG_PANEL,
	ConsentDialog,
} from '../../consent-dialog/src/consent-dialog';
import { testOptions } from '../../src/__tests__/test-local';
import { ConsentBanner } from '../../src/lib/banner/consent-banner';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import type { InthProviderOptions } from '../../src/lib/core/options';
import { provideInth } from '../../src/lib/core/provide-inth';
import { iabTestOptions } from '../../testing/src/__tests__/harness-test-bed';
import { IABConsentBanner } from './iab-consent-banner';
import { IABConsentDialog } from './iab-consent-dialog';

// The documented setup for a site that serves IAB and non-IAB policies:
// both sets of surfaces, each showing for its own models.
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, IABConsentBanner, IABConsentDialog],
	selector: 'test-side-by-side',
	template: `<inth-consent-banner />
		<inth-consent-dialog />
		<inth-iab-consent-banner />
		<inth-iab-consent-dialog />`,
})
class SideBySide {}

const byTestId = (id: string) =>
	document.querySelector(`[data-testid="${id}"]`);

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('standard and IAB surfaces side by side', () => {
	test('under an IAB policy only the IAB banner and dialog show', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as InthProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(SideBySide);
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(byTestId('iab-consent-banner-card')).not.toBeNull();
			},
			{ timeout: 5000 }
		);
		expect(byTestId('consent-banner-card')).toBeNull();

		TestBed.inject(ConsentManager).setActiveUI('dialog');
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(byTestId('iab-consent-dialog-card')).not.toBeNull();
			},
			{ timeout: 5000 }
		);
		expect(byTestId('consent-dialog-card')).toBeNull();
	});

	const iabPolicy = (): InthProviderOptions =>
		({
			...testOptions(),
			disableAnimation: true,
			...iabTestOptions(),
		}) as InthProviderOptions;

	/** The IAB dialog opened from the consent state, as preferences do. */
	const openPreferences = async (
		fixture: ReturnType<typeof TestBed.createComponent<SideBySide>>
	) => {
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(byTestId('iab-consent-banner-card')).not.toBeNull();
			},
			{ timeout: 5000 }
		);
		TestBed.inject(ConsentManager).setActiveUI('dialog');
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(byTestId('iab-consent-dialog-card')).not.toBeNull();
			},
			{ timeout: 5000 }
		);
		// Give a standard load the time it would take to start and settle.
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		await fixture.whenStable();
	};

	test('under an IAB policy, preferences load no standard dialog code', async () => {
		const loads = { panel: 0 };
		TestBed.configureTestingModule({
			providers: [
				provideInth(iabPolicy()),
				{
					provide: CONSENT_DIALOG_PANEL,
					useValue: async () => {
						loads.panel += 1;
						return (
							await import('../../consent-dialog/src/consent-dialog-panel')
						).ConsentDialogPanel;
					},
				},
			],
		});
		const fixture = TestBed.createComponent(SideBySide);
		await openPreferences(fixture);
		expect(loads.panel).toBe(0);
	}, 20_000);

	test('a standard dialog that fails to load leaves the IAB dialog open', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth(iabPolicy()),
				{
					provide: CONSENT_DIALOG_PANEL,
					useValue: () => Promise.reject(new Error('chunk failed')),
				},
			],
		});
		const fixture = TestBed.createComponent(SideBySide);
		await openPreferences(fixture);
		expect(TestBed.inject(ConsentManager).activeUI()).toBe('dialog');
		expect(byTestId('iab-consent-dialog-card')).not.toBeNull();
	}, 20_000);
});
