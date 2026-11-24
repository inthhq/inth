import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import { ConsentWidget } from '@inth/angular/consent-widget';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { ALL_CATEGORIES } from '../../src/__tests__/test-local';
import {
	bootHarnessTest,
	resetHarnessTest,
} from './__tests__/harness-test-bed';
import { ConsentWidgetHarness } from './consent-widget-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentWidget],
	selector: 'test-widget-host',
	template: '<inth-consent-widget />',
})
class WidgetHost {}

const bootWidget = async () => {
	const booted = await bootHarnessTest(WidgetHost);
	// The widget renders in place, so the fixture's own loader finds it.
	const widget = await booted.fixtureLoader.getHarness(ConsentWidgetHarness);
	return { ...booted, consent: TestBed.inject(ConsentManager), widget };
};

afterEach(resetHarnessTest);

describe('ConsentWidgetHarness', () => {
	test('lists the categories with their titles and switch states', async () => {
		const { consent, widget } = await bootWidget();

		const categories = await widget.getCategories();
		expect([...categories].sort()).toEqual([...ALL_CATEGORIES].sort());
		// In the order the consent types are declared.
		expect(categories).toEqual(
			consent
				.consentTypes()
				.map(({ name }) => name)
				.filter((name) => categories.includes(name))
		);
		expect(await widget.getCategoryTitle('marketing')).toBe('Marketing');
		expect(await widget.isCategoryDisabled('necessary')).toBe(true);
		expect(await widget.isCategoryChecked('necessary')).toBe(true);
		expect(await widget.isCategoryDisabled('marketing')).toBe(false);
		expect(await widget.isCategoryChecked('marketing')).toBe(false);
		expect(await widget.getActions()).toEqual(
			expect.arrayContaining(['accept', 'reject', 'save'])
		);
	});

	test('stages switches in the draft and records them on save', async () => {
		const { consent, widget } = await bootWidget();

		await widget.toggleCategory('marketing');
		await widget.setCategory('measurement', true);
		await widget.setCategory('measurement', true);
		expect(await widget.isCategoryChecked('marketing')).toBe(true);
		expect(consent.has('marketing')).toBe(false);

		await widget.save();

		expect(consent.has('marketing')).toBe(true);
		expect(consent.has('measurement')).toBe(true);
		expect(consent.has('experience')).toBe(false);
	});

	test('leaves a locked category unchanged', async () => {
		const { consent, widget } = await bootWidget();

		await widget.setCategory('necessary', false);

		expect(await widget.isCategoryChecked('necessary')).toBe(true);
		expect(consent.selectedConsents().necessary).not.toBe(false);
	});

	test('accepts and rejects every category', async () => {
		const accepted = await bootWidget();
		await accepted.widget.acceptAll();
		expect(accepted.consent.has('experience')).toBe(true);
		resetHarnessTest();

		const rejected = await bootWidget();
		await rejected.widget.rejectAll();
		expect(rejected.consent.explicitChoice()).not.toBeNull();
		expect(rejected.consent.has('experience')).toBe(false);
	});
});
