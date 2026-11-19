import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import {
	ConsentGate,
	ConsentGatePlaceholder,
} from '@inth/angular/consent-gate';
import { afterEach, describe, expect, test } from 'vitest';

import {
	bootHarnessTest,
	resetHarnessTest,
} from './__tests__/harness-test-bed';
import { ConsentDialogHarness } from './consent-dialog-harness';
import { ConsentGateHarness } from './consent-gate-harness';
import { SwitchHarness } from './switch-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog, ConsentGate, ConsentGatePlaceholder],
	selector: 'test-gate-host',
	template: `
		<inth-consent-gate
			category="marketing"
			class="video"
		>
			<p>Video player</p>
		</inth-consent-gate>
		<inth-consent-gate
			category="measurement"
			class="custom"
		>
			<p>Chart</p>
			<ng-template inthConsentGatePlaceholder>
				<p>Allow measurement to see the chart.</p>
			</ng-template>
		</inth-consent-gate>
		<inth-consent-dialog />
	`,
})
class GateHost {}

afterEach(resetHarnessTest);

describe('ConsentGateHarness', () => {
	test('shows the placeholder until the category is allowed', async () => {
		const { fixtureLoader } = await bootHarnessTest(GateHost);
		const gate = await fixtureLoader.getHarness(
			ConsentGateHarness.with({ selector: '.video' })
		);

		expect(await gate.isPlaceholderShown()).toBe(true);
		expect(await gate.getPlaceholderText()).not.toBe('');
		expect(await gate.canOpenPreferences()).toBe(true);
		expect(await gate.getText()).not.toContain('Video player');

		await TestBed.inject(ConsentManager).saveConsents('all');

		expect(await gate.isPlaceholderShown()).toBe(false);
		expect(await gate.getPlaceholderText()).toBeNull();
		expect(await gate.getText()).toBe('Video player');
		await expect(gate.openPreferences()).rejects.toThrow(
			'The consent gate offers no "customize" action.'
		);
	});

	test('opens the dialog, where allowing the category reveals the content', async () => {
		const { fixtureLoader, loader } = await bootHarnessTest(GateHost);
		const gate = await fixtureLoader.getHarness(
			ConsentGateHarness.with({ selector: '.video' })
		);

		await gate.openPreferences();
		const dialog = await loader.getHarness(ConsentDialogHarness);
		await (await dialog.getWidget()).setCategory('marketing', true);
		await dialog.save();

		expect(TestBed.inject(ConsentManager).has('marketing')).toBe(true);
		expect(await gate.getText()).toBe('Video player');
	});

	test('reports a custom placeholder through its text only', async () => {
		const { fixtureLoader } = await bootHarnessTest(GateHost);
		const gate = await fixtureLoader.getHarness(
			ConsentGateHarness.with({ selector: '.custom' })
		);

		expect(await gate.isPlaceholderShown()).toBe(false);
		expect(await gate.getText()).toBe('Allow measurement to see the chart.');
		// The gate is a loader for what it holds.
		expect(await gate.getAllHarnesses(SwitchHarness)).toEqual([]);
	});
});
