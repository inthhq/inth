import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { afterEach, describe, expect, test } from 'vitest';

import { Switch, SwitchHiddenInput, SwitchThumb } from './switch';

const render = async <ComponentType>(type: new () => ComponentType) => {
	const fixture = TestBed.createComponent(type);
	document.body.append(fixture.nativeElement);
	await fixture.whenStable();
	const root = fixture.nativeElement as HTMLElement;
	const get = (selector: string) => {
		const element = root.querySelector<HTMLElement>(selector);
		if (!element) {
			throw new Error(`Missing ${selector}`);
		}
		return element;
	};
	return { fixture, get, root };
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		Switch,
		SwitchThumb,
		SwitchHiddenInput,
		FormsModule,
		ReactiveFormsModule,
	],
	selector: 'test-switches',
	template: `
		<button
			id="model"
			inthSwitch
			[(checked)]="on"
		>
			<span inthSwitchThumb></span
			><input
				inthSwitchHiddenInput
				name="m"
			/>
		</button>
		<button
			id="ng-model"
			inthSwitch
			[(ngModel)]="ngOn"
		></button>
		<button
			id="reactive"
			inthSwitch
			[formControl]="control"
		></button>
	`,
})
class Switches {
	readonly on = signal(false);
	ngOn = true;
	readonly control = new FormControl(false, { nonNullable: true });
}

describe('inthSwitch', () => {
	test('renders the switch contract and toggles on click and Enter', async () => {
		const { fixture, get } = await render(Switches);
		const button = get('#model');
		expect(button.getAttribute('role')).toBe('switch');
		expect(button.getAttribute('type')).toBe('button');
		expect(button.getAttribute('data-slot')).toBe('switch');
		expect(button.getAttribute('aria-checked')).toBe('false');
		expect(button.getAttribute('data-state')).toBe('unchecked');
		expect(get('[data-slot="switch-thumb"]')).toBeTruthy();

		button.click();
		await fixture.whenStable();
		expect(fixture.componentInstance.on()).toBe(true);
		expect(button.getAttribute('aria-checked')).toBe('true');
		expect(button.getAttribute('data-state')).toBe('checked');
		expect((get('input[name="m"]') as HTMLInputElement).checked).toBe(true);

		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await fixture.whenStable();
		expect(fixture.componentInstance.on()).toBe(false);
	});

	test('works as a form control with ngModel and reactive forms', async () => {
		const { fixture, get } = await render(Switches);
		await fixture.whenStable();
		expect(get('#ng-model').getAttribute('aria-checked')).toBe('true');
		get('#ng-model').click();
		await fixture.whenStable();
		expect(fixture.componentInstance.ngOn).toBe(false);

		const { control } = fixture.componentInstance;
		get('#reactive').click();
		expect(control.value).toBe(true);
		control.setValue(false);
		await fixture.whenStable();
		expect(get('#reactive').getAttribute('aria-checked')).toBe('false');

		control.disable();
		await fixture.whenStable();
		expect(get('#reactive').hasAttribute('disabled')).toBe(true);
		expect(get('#reactive').getAttribute('data-disabled')).toBe('');
	});
});
