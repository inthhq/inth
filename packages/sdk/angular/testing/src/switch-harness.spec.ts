import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Switch } from '@inth/angular/primitives';
import { afterEach, describe, expect, test } from 'vitest';

import { SwitchHarness } from './switch-harness';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Switch],
	selector: 'test-switch-host',
	template: `
		<button
			inthSwitch
			aria-label="Marketing"
			[(checked)]="marketing"
		></button>
		<button
			inthSwitch
			aria-label="Necessary"
			[checked]="true"
			[disabled]="true"
		></button>
	`,
})
class SwitchHost {
	readonly marketing = signal(false);
}

const boot = async () => {
	const fixture = TestBed.createComponent(SwitchHost);
	await fixture.whenStable();
	return { fixture, loader: TestbedHarnessEnvironment.loader(fixture) };
};

afterEach(() => {
	TestBed.resetTestingModule();
});

describe('SwitchHarness', () => {
	test('finds switches by label and state', async () => {
		const { loader } = await boot();

		expect(await loader.getAllHarnesses(SwitchHarness)).toHaveLength(2);
		const necessary = await loader.getHarness(
			SwitchHarness.with({ checked: true, disabled: true })
		);
		expect(await necessary.getLabel()).toBe('Necessary');
		expect(
			await loader.getAllHarnesses(SwitchHarness.with({ label: /^Mark/u }))
		).toHaveLength(1);
	});

	test('check, uncheck and toggle update the bound value', async () => {
		const { fixture, loader } = await boot();
		const marketing = await loader.getHarness(
			SwitchHarness.with({ label: 'Marketing' })
		);

		await marketing.check();
		expect(fixture.componentInstance.marketing()).toBe(true);
		await marketing.check();
		expect(await marketing.isChecked()).toBe(true);

		await marketing.uncheck();
		expect(fixture.componentInstance.marketing()).toBe(false);

		await marketing.toggle();
		expect(fixture.componentInstance.marketing()).toBe(true);
	});

	test('a disabled switch ignores toggle', async () => {
		const { loader } = await boot();
		const necessary = await loader.getHarness(
			SwitchHarness.with({ label: 'Necessary' })
		);

		await necessary.toggle();

		expect(await necessary.isChecked()).toBe(true);
		expect(await necessary.isDisabled()).toBe(true);
	});

	test('reports focus', async () => {
		const { loader } = await boot();
		const marketing = await loader.getHarness(
			SwitchHarness.with({ label: 'Marketing' })
		);

		await marketing.focus();
		expect(await marketing.isFocused()).toBe(true);
		await marketing.blur();
		expect(await marketing.isFocused()).toBe(false);
	});
});
