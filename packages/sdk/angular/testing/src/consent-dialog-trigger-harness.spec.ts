import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import { afterEach, describe, expect, test } from 'vitest';

import {
	bootHarnessTest,
	resetHarnessTest,
} from './__tests__/harness-test-bed';
import { ConsentDialogHarness } from './consent-dialog-harness';
import { ConsentDialogTriggerHarness } from './consent-dialog-trigger-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog, ConsentDialogTrigger],
	selector: 'test-trigger-host',
	template: `
		<inth-consent-dialog-trigger
			label="Cookie settings"
			[persistPosition]="false"
		/>
		<inth-consent-dialog />
	`,
})
class TriggerHost {}

afterEach(resetHarnessTest);

describe('ConsentDialogTriggerHarness', () => {
	test('opens the dialog and hides while it is open', async () => {
		const { loader } = await bootHarnessTest(TriggerHost);
		const consent = TestBed.inject(ConsentManager);
		const trigger = await loader.getHarness(
			ConsentDialogTriggerHarness.with({ label: 'Cookie settings' })
		);
		expect(await trigger.getLabel()).toBe('Cookie settings');

		await trigger.openPreferences();

		expect(consent.activeUI()).toBe('dialog');
		expect(consent.explicitChoice()).toBeNull();
		expect(await loader.getHarness(ConsentDialogHarness)).toBeTruthy();
		expect(
			await loader.getHarnessOrNull(ConsentDialogTriggerHarness)
		).toBeNull();
	});

	test('comes back once the dialog closes', async () => {
		const { loader } = await bootHarnessTest(TriggerHost);
		await (
			await loader.getHarness(ConsentDialogTriggerHarness)
		).openPreferences();

		await (await loader.getHarness(ConsentDialogHarness)).acceptAll();

		expect(TestBed.inject(ConsentManager).has('marketing')).toBe(true);
		expect(
			await loader.getHarnessOrNull(ConsentDialogTriggerHarness)
		).not.toBeNull();
	});
});
