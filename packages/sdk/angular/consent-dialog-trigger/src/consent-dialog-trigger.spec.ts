import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, test } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import { provideInth } from '../../src/lib/core/provide-inth';
import { ConsentDialogTrigger } from './consent-dialog-trigger';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialogTrigger],
	selector: 'test-trigger-corner',
	template: `<inth-consent-dialog-trigger
		defaultPosition="bottom-left"
		[persistPosition]="false"
	/>`,
})
class TriggerCorner {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialogTrigger],
	selector: 'test-trigger-after-consent',
	template: `<inth-consent-dialog-trigger
		showWhen="after-consent"
		[persistPosition]="false"
	/>`,
})
class TriggerAfterConsent {}

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('ConsentDialogTrigger', () => {
	test('after-consent waits until no prompt is owed', async () => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(TriggerAfterConsent);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		const trigger = () =>
			document.querySelector('[data-testid="consent-dialog-trigger"]');
		expect(consent.promptRequirement().kind).not.toBe('none');
		expect(trigger()).toBeNull();

		await consent.saveConsents('all');
		await fixture.whenStable();
		expect(trigger()?.getAttribute('aria-label')).toBe('Open privacy settings');
	});

	test('starts in the corner defaultPosition names', async () => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(TriggerCorner);
		await fixture.whenStable();
		const trigger = fixture.debugElement.query(
			By.directive(ConsentDialogTrigger)
		).componentInstance as ConsentDialogTrigger;
		// The stock classes come from CSS modules, which are empty here.
		expect(trigger['corner']()).toBe('bottom-left');
	});

	test('opens from the keyboard after a drag', async () => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(TriggerCorner);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		// The trigger portals into <body>.
		const button = document.querySelector<HTMLButtonElement>(
			'[data-testid="consent-dialog-trigger"]'
		) as HTMLButtonElement;
		const pointer = (type: string, clientX: number) =>
			button.dispatchEvent(
				new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 0 })
			);
		pointer('pointerdown', 0);
		pointer('pointermove', 40);
		pointer('pointerup', 40);
		// The pointer click that ends the drag opens nothing.
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await fixture.whenStable();
		expect(consent.activeUI()).not.toBe('dialog');

		// Enter or Space on a button is a click with no pointer press first.
		button.click();
		await fixture.whenStable();
		expect(consent.activeUI()).toBe('dialog');
	});

	test('opens on the next click after a cancelled drag', async () => {
		TestBed.configureTestingModule({
			providers: [provideInth({ ...testOptions(), disableAnimation: true })],
		});
		const fixture = TestBed.createComponent(TriggerCorner);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		const button = document.querySelector<HTMLButtonElement>(
			'[data-testid="consent-dialog-trigger"]'
		) as HTMLButtonElement;
		const pointer = (type: string, clientX: number) =>
			button.dispatchEvent(
				new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 0 })
			);
		pointer('pointerdown', 0);
		pointer('pointermove', 40);
		// The browser took the gesture over: no pointerup and no click follow.
		pointer('pointercancel', 40);

		button.click();
		await fixture.whenStable();
		expect(consent.activeUI()).toBe('dialog');
	});
});
