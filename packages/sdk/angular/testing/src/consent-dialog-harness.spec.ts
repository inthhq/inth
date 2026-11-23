import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import type { PolicyRule } from '@inth/sdk/engine';
import { afterEach, describe, expect, test } from 'vitest';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';
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

const US_OPT_OUT = {
	mode: offlineMode([
		{
			id: 'test-us-opt-out',
			match: { fallback: true, isDefault: true },
			model: 'opt-out',
			prompt: 'none',
			rights: ['disclosure', 'preferences', 'opt-out'],
		} as PolicyRule,
	]),
} as Partial<InthProviderOptions>;

const openDialog = async (options: Partial<InthProviderOptions> = {}) => {
	const booted = await bootHarnessTest(DialogHost, options);
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

	test('reads the copy and saves a category from its switches', async () => {
		const { consent, dialog, loader } = await openDialog();

		expect(await dialog.getTitle()).toBe('Privacy settings');
		expect(await dialog.getDescription()).toBeTruthy();
		expect(await dialog.getRegime()).toBe('eu');
		expect(await dialog.isBlocking()).toBe(true);
		expect(
			await loader.getHarnessOrNull(
				ConsentDialogHarness.with({ title: 'Privacy settings' })
			)
		).not.toBeNull();
		expect(await dialog.getCategories()).toEqual(
			expect.arrayContaining(['measurement', 'marketing'])
		);
		await expect(dialog.save()).rejects.toThrow(
			'The dialog\'s "save" action is disabled'
		);

		await dialog.setCategory('measurement', true);
		expect(await dialog.isCategoryEnabled('measurement')).toBe(true);
		expect(consent.has('measurement')).toBe(false);

		await dialog.save();

		expect(consent.has('measurement')).toBe(true);
		expect(consent.has('marketing')).toBe(false);
		expect(await loader.getHarnessOrNull(ConsentDialogHarness)).toBeNull();
	});

	test('throws for Preferences, which only a US dialog has', async () => {
		const { dialog } = await openDialog();

		await expect(dialog.openPreferences()).rejects.toThrow(
			'The dialog offers no "preferences" action.'
		);
	});

	test('under a US policy, opens Preferences, where a switch applies at once', async () => {
		const { consent, dialog } = await openDialog(US_OPT_OUT);

		expect(await dialog.getRegime()).toBe('us');
		await expect(dialog.acceptAll()).rejects.toThrow(
			'The dialog offers no "accept" action.'
		);
		await expect(dialog.save()).rejects.toThrow(
			'The dialog offers no "save" action.'
		);
		expect(consent.has('measurement')).toBe(true);

		await dialog.setCategory('measurement', false);

		expect(await dialog.isCategoryEnabled('measurement')).toBe(false);
		expect(consent.has('measurement')).toBe(false);
		expect(consent.explicitChoice()).not.toBeNull();
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
