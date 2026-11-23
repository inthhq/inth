import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
} from '@angular/core';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import { resolveNoStyle } from '../core/no-style';

/**
 * A choice switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03); a category that cannot change shows
 * "Always on" instead of a switch.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(click)': 'checkedChange.emit(!checked())',
		'[attr.aria-checked]': 'checked() ? "true" : "false"',
		'[attr.class]': 'className()',
		'[attr.data-size]': 'size() === "small" ? "small" : null',
		'[attr.data-state]': 'checked() ? "checked" : "unchecked"',
		role: 'switch',
		type: 'button',
	},
	selector: 'button[inth-choice-switch]',
	template: '',
})
export class ChoiceSwitch {
	readonly checked = input.required<boolean>();
	/** The vendor table's switches are smaller. */
	readonly size = input<'default' | 'small'>('default');
	/** Drop the stock classes. Defaults to the surface's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Emits the value the visitor asked for. */
	readonly checkedChange = output<boolean>();

	readonly #noStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly className = computed(() =>
		this.#noStyle() ? null : styles.switch || null
	);
}
