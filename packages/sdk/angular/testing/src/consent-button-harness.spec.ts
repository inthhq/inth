import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentButton, ConsentManager } from '@inth/angular';
import { afterEach, describe, expect, test } from 'vitest';

import {
	bootHarnessTest,
	resetHarnessTest,
} from './__tests__/harness-test-bed';
import { ConsentButtonHarness } from './consent-button-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentButton],
	selector: 'test-button-host',
	template: `
		<button
			inth-consent-button
			action="accept"
		>
			Allow all
		</button>
		<button
			inth-consent-button
			[action]="'reject'"
			data-action="reject"
		>
			Only necessary
		</button>
		<button
			inth-consent-button
			[action]="'customize'"
		>
			Settings
		</button>
	`,
})
class ButtonHost {}

afterEach(resetHarnessTest);

describe('ConsentButtonHarness', () => {
	test('filters by action and text', async () => {
		const { fixtureLoader } = await bootHarnessTest(ButtonHost);

		expect(
			await fixtureLoader.getAllHarnesses(ConsentButtonHarness)
		).toHaveLength(3);
		const reject = await fixtureLoader.getHarness(
			ConsentButtonHarness.with({ action: 'reject' })
		);
		expect(await reject.getText()).toBe('Only necessary');
		const settings = await fixtureLoader.getHarness(
			ConsentButtonHarness.with({ text: 'Settings' })
		);
		// Bound with [action] and no data-action: the DOM does not say.
		expect(await settings.getAction()).toBeNull();
		expect(await settings.isDisabled()).toBe(false);
	});

	test('click records the button action', async () => {
		const { fixtureLoader } = await bootHarnessTest(ButtonHost);
		const consent = TestBed.inject(ConsentManager);
		const accept = await fixtureLoader.getHarness(
			ConsentButtonHarness.with({ action: 'accept' })
		);

		await accept.click();

		expect(consent.has('marketing')).toBe(true);
	});

	test('a customize button opens the dialog without a choice', async () => {
		const { fixtureLoader } = await bootHarnessTest(ButtonHost);
		const consent = TestBed.inject(ConsentManager);

		await (
			await fixtureLoader.getHarness(
				ConsentButtonHarness.with({ text: 'Settings' })
			)
		).click();

		expect(consent.activeUI()).toBe('dialog');
		expect(consent.explicitChoice()).toBeNull();
	});
});
