import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { afterEach, describe, expect, test } from 'vitest';

import {
	bootHarnessTest,
	resetHarnessTest,
} from './__tests__/harness-test-bed';
import { ConsentDialogHarness } from './consent-dialog-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-dialog-host',
	template: '<inth-consent-dialog />',
})
class DialogHost {}

const openDialog = async () => {
	const booted = await bootHarnessTest(DialogHost);
	const consent = TestBed.inject(ConsentManager);
	consent.setActiveUI('dialog');
	const dialog = await booted.loader.getHarness(ConsentDialogHarness);
	return { ...booted, consent, dialog };
};

afterEach(resetHarnessTest);

describe('ConsentDialogHarness', () => {
	test('is absent until the dialog opens', async () => {
		const { loader } = await bootHarnessTest(DialogHost);

		expect(await loader.getHarnessOrNull(ConsentDialogHarness)).toBeNull();
	});

	test('reads the copy and saves a category from its widget', async () => {
		const { consent, dialog, loader } = await openDialog();

		expect(await dialog.getTitle()).toBe('Privacy Settings');
		expect(await dialog.getDescription()).not.toBe('');
		expect(
			await loader.getHarnessOrNull(
				ConsentDialogHarness.with({ title: 'Privacy Settings' })
			)
		).not.toBeNull();

		const widget = await dialog.getWidget();
		await widget.setCategory('measurement', true);
		expect(consent.has('measurement')).toBe(false);

		await dialog.save();

		expect(consent.has('measurement')).toBe(true);
		expect(consent.has('marketing')).toBe(false);
		expect(await loader.getHarnessOrNull(ConsentDialogHarness)).toBeNull();
	});

	test('accepts and rejects every category', async () => {
		const accepted = await openDialog();
		await accepted.dialog.acceptAll();
		expect(accepted.consent.has('marketing')).toBe(true);
		resetHarnessTest();

		const rejected = await openDialog();
		await rejected.dialog.rejectAll();
		expect(rejected.consent.explicitChoice()).not.toBeNull();
		expect(rejected.consent.has('marketing')).toBe(false);
	});

	test('closes on Escape without recording a choice', async () => {
		const { consent, dialog, loader } = await openDialog();

		await dialog.close();

		expect(consent.activeUI()).not.toBe('dialog');
		expect(consent.explicitChoice()).toBeNull();
		expect(await loader.getHarnessOrNull(ConsentDialogHarness)).toBeNull();
	});
});
