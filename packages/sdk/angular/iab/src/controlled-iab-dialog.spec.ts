import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import type { InthProviderOptions } from '../../src/lib/core/options';
import { provideInth } from '../../src/lib/core/provide-inth';
import { iabTestOptions } from '../../testing/src/__tests__/harness-test-bed';
import { IABConsentDialog } from './iab-consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-controlled-iab-dialog',
	template: `<inth-iab-consent-dialog [(open)]="open" />`,
})
class ControlledIABDialog {
	readonly open = signal<boolean | undefined>(true);
}

const WAIT = { timeout: 5000 };

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('<inth-iab-consent-dialog [(open)]>', () => {
	test.each([
		[
			'Escape',
			(root: HTMLElement) =>
				root.dispatchEvent(
					new KeyboardEvent('keydown', {
						bubbles: true,
						cancelable: true,
						key: 'Escape',
					})
				),
		],
		[
			'the close button',
			() =>
				(
					document.querySelector(
						'[data-testid="iab-consent-dialog-close"]'
					) as HTMLElement
				).click(),
		],
	])('closes on %s when the parent owns open', async (_name, close) => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as InthProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(ControlledIABDialog);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(
				document.querySelector('[data-testid="iab-consent-dialog-close"]')
			).not.toBeNull();
		}, WAIT);
		const root = document.querySelector(
			'[data-testid="iab-consent-dialog-card"]'
		) as HTMLElement;

		close(root);
		await fixture.whenStable();

		expect(fixture.componentInstance.open()).toBe(false);
	});

	test.each([
		['save', 'button[data-action="customize"]'],
		['accept', 'button[data-action="accept"]'],
		['reject', 'button[data-action="reject"]'],
	])("closes the parent's open after %s", async (_name, selector) => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
					...iabTestOptions(),
				} as InthProviderOptions),
			],
		});
		const fixture = TestBed.createComponent(ControlledIABDialog);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(document.querySelector(selector)).not.toBeNull();
		}, WAIT);

		(document.querySelector(selector) as HTMLElement).click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(fixture.componentInstance.open()).toBe(false);
		}, WAIT);
		await fixture.whenStable();
		expect(
			document.querySelector('[data-testid="iab-consent-dialog-card"]')
		).toBeNull();
	});
});
