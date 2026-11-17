import {
	computed,
	Directive,
	forwardRef,
	inject,
	input,
	model,
	signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import type { ControlValueAccessor } from '@angular/forms';
import {
	getDataDisabled,
	getSwitchState,
	toggleSwitchValue,
} from '@c15t/ui/primitives';

/**
 * A headless switch on the host `<button>`: `role="switch"`,
 * `aria-checked`, `data-state="checked" | "unchecked"` and
 * `data-slot="switch"`. Click or Enter toggles it.
 *
 * Bind `[(checked)]`, or use it as a form control with `[(ngModel)]`,
 * `formControlName` or `[formControl]`.
 *
 * @example
 * ```html
 * <button c15tSwitch [(checked)]="marketing" aria-label="Marketing">
 *   <span c15tSwitchControl><span c15tSwitchThumb></span></span>
 * </button>
 *
 * <button c15tSwitch formControlName="analytics" aria-label="Analytics"></button>
 * ```
 */
@Directive({
	exportAs: 'c15tSwitch',
	host: {
		'(blur)': 'markTouched()',
		'(click)': 'toggle()',
		'(keydown.enter)': 'toggleOnEnter($event)',
		'[attr.aria-checked]': 'checked()',
		'[attr.data-disabled]': 'dataDisabled()',
		'[attr.data-state]': 'dataState()',
		'[attr.disabled]': 'isDisabled() ? "" : null',
		'[attr.type]': 'type()',
		'data-slot': 'switch',
		role: 'switch',
	},
	providers: [
		{
			multi: true,
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => Switch),
		},
	],
	selector: '[c15tSwitch]',
})
export class Switch implements ControlValueAccessor {
	/** Whether the switch is on. */
	readonly checked = model(false);
	/** Whether the switch ignores input. */
	readonly disabled = input(false);
	/** The button's `type`. */
	readonly type = input<'button' | 'submit' | 'reset'>('button');

	readonly #formDisabled = signal(false);
	#onChange: (value: boolean) => void = () => undefined;
	#onTouched: () => void = () => undefined;

	/** Whether the input or a form disabled the switch. */
	readonly isDisabled = computed(() => this.disabled() || this.#formDisabled());
	/** @internal */
	protected readonly dataState = computed(() => getSwitchState(this.checked()));
	/** @internal */
	protected readonly dataDisabled = computed(() =>
		getDataDisabled(this.isDisabled())
	);

	/** Flip the switch, unless it is disabled. */
	toggle(): void {
		if (this.isDisabled()) {
			return;
		}
		const next = toggleSwitchValue(this.checked());
		this.checked.set(next);
		this.#onChange(next);
	}

	/** @internal */
	protected toggleOnEnter(event: Event): void {
		event.preventDefault();
		this.toggle();
	}

	/** @internal */
	protected markTouched(): void {
		this.#onTouched();
	}

	/** @internal */
	writeValue(value: unknown): void {
		this.checked.set(Boolean(value));
	}

	/** @internal */
	registerOnChange(fn: (value: boolean) => void): void {
		this.#onChange = fn;
	}

	/** @internal */
	registerOnTouched(fn: () => void): void {
		this.#onTouched = fn;
	}

	/** @internal */
	setDisabledState(disabled: boolean): void {
		this.#formDisabled.set(disabled);
	}
}

/** The switch's track: `data-slot="switch-track"`. */
@Directive({
	host: { 'data-slot': 'switch-track' },
	selector: '[c15tSwitchControl]',
})
export class SwitchControl {}

/** The switch's thumb: `data-slot="switch-thumb"`. */
@Directive({
	host: { 'data-slot': 'switch-thumb' },
	selector: '[c15tSwitchThumb]',
})
export class SwitchThumb {}

/**
 * A visually hidden checkbox that mirrors the switch, so a native `<form>`
 * submits its value. Place it inside the `c15tSwitch` element.
 *
 * @example
 * ```html
 * <button c15tSwitch [(checked)]="on"><input c15tSwitchHiddenInput name="marketing" /></button>
 * ```
 */
@Directive({
	host: {
		'[attr.disabled]': 'root.isDisabled() ? "" : null',
		'[checked]': 'root.checked()',
		'[value]': 'value()',
		'aria-hidden': 'true',
		style:
			'position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;',
		tabindex: '-1',
		type: 'checkbox',
	},
	selector: 'input[c15tSwitchHiddenInput]',
})
export class SwitchHiddenInput {
	/** @internal */
	protected readonly root = inject(Switch);
	/** The submitted value while checked. */
	readonly value = input('on');
}
