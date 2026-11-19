import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import { provideInth } from '../../src/lib/core/provide-inth';
import { ConsentDialog } from './consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-controlled-dialog',
	template: `<inth-consent-dialog [(open)]="open" />`,
})
class ControlledDialog {
	readonly open = signal<boolean | undefined>(true);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-controlled-dialog-trigger',
	template: `<inth-consent-dialog
		[(open)]="open"
		[showTrigger]="true"
	/>`,
})
class ControlledWithTrigger {
	readonly open = signal(false);
}

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('<inth-consent-dialog [(open)]>', () => {
	test('closes on Escape when the parent owns open', async () => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(ControlledDialog);
		const consent = TestBed.inject(ConsentManager);
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(
					document.querySelector('[data-testid="consent-dialog-root"]')
				).not.toBeNull();
			},
			// The first test in the file waits for the dialog chunk's cold import.
			{ timeout: 5000 }
		);
		// The parent opened it, so the consent state never moved to it.
		consent.setActiveUI('none');
		await fixture.whenStable();
		const root = document.querySelector(
			'[data-testid="consent-dialog-root"]'
		) as HTMLElement;

		root.dispatchEvent(
			new KeyboardEvent('keydown', {
				bubbles: true,
				cancelable: true,
				key: 'Escape',
			})
		);
		await fixture.whenStable();

		expect(fixture.componentInstance.open()).toBe(false);
	});

	test.each([
		['save', 'consent-widget-footer-save-button'],
		['accept', 'consent-widget-footer-accept-all-button'],
		['reject', 'consent-widget-reject-button'],
	])("closes the parent's open after %s", async (_name, testId) => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(ControlledDialog);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(
				document.querySelector(`[data-testid="${testId}"]`)
			).not.toBeNull();
		});

		(
			document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
		).click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(fixture.componentInstance.open()).toBe(false);
		});
		await fixture.whenStable();
		expect(
			document.querySelector('[data-testid="consent-dialog-root"]')
		).toBeNull();
	});

	test('the trigger opens it, and hides while it is open', async () => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(ControlledWithTrigger);
		const trigger = () =>
			document.querySelector<HTMLElement>(
				'[data-testid="consent-dialog-trigger"]'
			);
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(trigger()).not.toBeNull();
			},
			{ timeout: 5000 }
		);

		trigger()?.click();
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(fixture.componentInstance.open()).toBe(true);
				expect(
					document.querySelector('[data-testid="consent-dialog-root"]')
				).not.toBeNull();
			},
			{ timeout: 5000 }
		);
		expect(trigger()).toBeNull();

		// Closed by its parent, the trigger comes back.
		fixture.componentInstance.open.set(false);
		await vi.waitFor(
			async () => {
				await fixture.whenStable();
				expect(trigger()).not.toBeNull();
			},
			{ timeout: 5000 }
		);
	}, 20_000);
});
