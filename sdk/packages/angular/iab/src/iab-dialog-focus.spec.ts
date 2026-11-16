import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import type { C15tProviderOptions } from '../../src/lib/core/options';
import { provideC15t } from '../../src/lib/core/provide-c15t';
import { iabTestOptions } from '../../testing/src/__tests__/harness-test-bed';
import { IABConsentBanner } from './iab-consent-banner';
import { IABConsentDialog } from './iab-consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentBanner, IABConsentDialog],
	selector: 'test-iab-focus',
	template: `<c15t-iab-consent-banner /><c15t-iab-consent-dialog />`,
})
class Host {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-controlled-focus',
	template: `<button
			type="button"
			data-testid="opener"
		>
			Preferences
		</button>
		<c15t-iab-consent-dialog [(open)]="open" />`,
})
class ControlledHost {
	readonly open = signal<boolean | undefined>(false);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-mounted-open',
	template: `<button
			type="button"
			data-testid="opener"
		>
			Preferences
		</button>
		@if (shown()) {
			<c15t-iab-consent-dialog
				[open]="true"
				(openChange)="shown.set($event)"
			/>
		}`,
})
class MountedOpenHost {
	readonly shown = signal(false);
}

const WAIT = { timeout: 5000 };

const byTestId = (id: string) =>
	document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('a non-blocking IAB dialog', () => {
	test('takes focus when it opens, and gives it back when it closes', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
					scrollLock: false,
					trapFocus: false,
				} as C15tProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(Host);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-banner-customize-button')).not.toBeNull();
		}, WAIT);

		const customize = byTestId(
			'iab-consent-banner-customize-button'
		) as HTMLElement;
		customize.focus();
		customize.click();
		await vi.waitFor(async () => {
			await settle();
			const card = byTestId('iab-consent-dialog-card');
			expect(card).not.toBeNull();
			expect(card?.contains(document.activeElement)).toBe(true);
		}, WAIT);

		byTestId('iab-consent-dialog-close')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-dialog-card')).toBeNull();
			expect(document.activeElement).toBe(
				byTestId('iab-consent-banner-customize-button')
			);
		}, WAIT);
	}, 20_000);

	test('a non-blocking dialog controlled through [(open)] gives focus back to its opener', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					scrollLock: false,
					trapFocus: false,
					...iabTestOptions(),
				} as C15tProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(ControlledHost);
		document.body.append(fixture.nativeElement);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();

		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(
				byTestId('iab-consent-dialog-card')?.contains(document.activeElement)
			).toBe(true);
		}, WAIT);

		fixture.componentInstance.open.set(false);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-dialog-card')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);

	test('gives focus back when the parent hands open back while the dialog is closed to the consent state', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					scrollLock: false,
					trapFocus: false,
					...iabTestOptions(),
				} as C15tProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(ControlledHost);
		document.body.append(fixture.nativeElement);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();

		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(
				byTestId('iab-consent-dialog-card')?.contains(document.activeElement)
			).toBe(true);
		}, WAIT);

		// Control goes back to the consent state, which has no dialog open.
		fixture.componentInstance.open.set(undefined);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-dialog-card')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);

	test('a dialog mounted already open gives focus back to its opener', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
					scrollLock: false,
					trapFocus: false,
				} as C15tProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(MountedOpenHost);
		document.body.append(fixture.nativeElement);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();

		fixture.componentInstance.shown.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(
				byTestId('iab-consent-dialog-card')?.contains(document.activeElement)
			).toBe(true);
		}, WAIT);

		// Escape closes it: the parent removes it from the page.
		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('iab-consent-dialog-card')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);
});
