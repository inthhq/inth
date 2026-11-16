import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import { ConsentBanner } from '../../src/lib/banner/consent-banner';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import { warmDialog } from '../../src/lib/core/dialog-warming';
import { local } from '../../src/lib/core/modes';
import type { C15tProviderOptions } from '../../src/lib/core/options';
import { provideC15t } from '../../src/lib/core/provide-c15t';
import { iabTestOptions } from '../../testing/src/__tests__/harness-test-bed';
import { IABConsentBanner } from './iab-consent-banner';
import {
	IAB_CONSENT_DIALOG_BODY,
	IABConsentDialog,
} from './iab-consent-dialog';
import { IABConsentDialogBody } from './iab-consent-dialog-body';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentBanner, IABConsentDialog],
	selector: 'test-iab-banner-and-dialog',
	template: `<c15t-iab-consent-banner /><c15t-iab-consent-dialog />`,
})
class Host {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, IABConsentBanner, IABConsentDialog],
	selector: 'test-side-by-side',
	template: `<c15t-consent-banner /><c15t-iab-consent-banner /><c15t-iab-consent-dialog />`,
})
class SideBySide {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-controlled-iab-load',
	template: `<c15t-iab-consent-dialog [(open)]="open" />`,
})
class ControlledHost {
	readonly open = signal(false);
}

/** Loads and change detection are slow on a busy machine. */
const WAIT = { timeout: 5000 };

const byTestId = (id: string) =>
	document.querySelector(`[data-testid="${id}"]`);

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('the IAB dialog body loading', () => {
	const countingLoader = () => {
		const loader = { loads: 0 };
		const provider = {
			provide: IAB_CONSENT_DIALOG_BODY,
			useValue: (): Promise<Type<IABConsentDialogBody>> => {
				loader.loads += 1;
				return Promise.resolve(IABConsentDialogBody);
			},
		};
		return { loader, provider };
	};
	/** Longer than the page-load idle boundary's fallback delay. */
	const afterIdle = () =>
		new Promise((resolve) => {
			setTimeout(resolve, 600);
		});

	/** IAB configured, as a side-by-side app does, under an opt-in policy. */
	const optInWithIAB = (): C15tProviderOptions =>
		({
			...testOptions(),
			disableAnimation: true,
			...iabTestOptions(),
			mode: local({
				acknowledgeNoRecords: true,
				policyRules: [
					{
						id: 'opt-in',
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
					},
				],
			}),
		}) as C15tProviderOptions;

	test('loads nothing under a policy that is not IAB', async () => {
		const { loader, provider } = countingLoader();
		TestBed.configureTestingModule({
			providers: [provideC15t(optInWithIAB()), provider],
		});
		const fixture = TestBed.createComponent(SideBySide);
		const consent = TestBed.inject(ConsentManager);
		// The standard banner renders: the policy is not IAB.
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(byTestId('consent-banner-card')).not.toBeNull();
		}, WAIT);
		await afterIdle();
		await fixture.whenStable();
		expect(consent.model()).toBe('opt-in');
		expect(byTestId('iab-consent-banner-card')).toBeNull();
		// A standard dialog's opener warms every dialog; this one cannot open.
		warmDialog();
		await afterIdle();
		await fixture.whenStable();
		expect(loader.loads).toBe(0);
	}, 20_000);

	test('prefetches once after the page loads under an IAB policy', async () => {
		const { loader, provider } = countingLoader();
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as C15tProviderOptions),
				provider,
			],
		});
		const fixture = TestBed.createComponent(Host);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(loader.loads).toBe(1);
		}, WAIT);
		await afterIdle();
		await fixture.whenStable();
		expect(loader.loads).toBe(1);
	}, 20_000);

	test('a warm-up after a failed prefetch loads it again', async () => {
		const loader = { loads: 0 };
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as C15tProviderOptions),
				{
					provide: IAB_CONSENT_DIALOG_BODY,
					useValue: (): Promise<Type<IABConsentDialogBody>> => {
						loader.loads += 1;
						return Promise.reject(new Error('chunk failed'));
					},
				},
			],
		});
		const fixture = TestBed.createComponent(Host);
		// The idle prefetch fails.
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(loader.loads).toBeGreaterThan(0);
		}, WAIT);
		const before = loader.loads;

		// A preferences link warms it, as hovering `c15tConsentDialogLink` does.
		warmDialog();
		await vi.waitFor(() => {
			expect(loader.loads).toBe(before + 1);
		}, WAIT);
	}, 20_000);

	test('a failed load gives the banner back, and the next open loads it', async () => {
		// Fails until `works` turns true. The idle prefetch may load it
		// before the test opens the dialog, so the test counts loads.
		const loader = { loads: 0, works: false };
		const load = (): Promise<Type<IABConsentDialogBody>> => {
			loader.loads += 1;
			return loader.works
				? Promise.resolve(IABConsentDialogBody)
				: Promise.reject(new Error('chunk failed'));
		};
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as C15tProviderOptions),
				{ provide: IAB_CONSENT_DIALOG_BODY, useValue: load },
			],
		});
		const fixture = TestBed.createComponent(Host);
		const consent = TestBed.inject(ConsentManager);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-banner-card')).not.toBeNull();
		}, WAIT);

		const before = loader.loads;
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(loader.loads).toBeGreaterThan(before);
			expect(consent.activeUI()).toBe('banner');
		}, WAIT);
		expect(byTestId('iab-consent-dialog-card')).toBeNull();

		loader.works = true;
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-dialog-card')).not.toBeNull();
		}, WAIT);
	});

	test('a controlled dialog whose load fails hands open back to the parent', async () => {
		const loader = { loads: 0, works: false };
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as C15tProviderOptions),
				{
					provide: IAB_CONSENT_DIALOG_BODY,
					useValue: (): Promise<Type<IABConsentDialogBody>> => {
						loader.loads += 1;
						return loader.works
							? Promise.resolve(IABConsentDialogBody)
							: Promise.reject(new Error('chunk failed'));
					},
				},
			],
		});
		const fixture = TestBed.createComponent(ControlledHost);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		// The IAB state loads before the dialog can show.
		await vi.waitFor(async () => {
			await settle();
			expect(TestBed.inject(ConsentManager).iab()).not.toBeNull();
		}, WAIT);
		const before = loader.loads;

		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(loader.loads).toBeGreaterThan(before);
			expect(fixture.componentInstance.open()).toBe(false);
		}, WAIT);

		loader.works = true;
		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-dialog-card')).not.toBeNull();
		}, WAIT);
	}, 20_000);
});
