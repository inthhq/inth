import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
} from '@angular/core';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style-scope';
import { slotPart } from './part-class-names.model';

/**
 * A choice switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03); a category that cannot change shows
 * "Always on" instead of a switch. Takes the `toggle` theme slot, as the
 * `ConsentWidget` switch does.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(click)': 'checkedChange.emit(!checked())',
		'[attr.aria-checked]': 'checked() ? "true" : "false"',
		'[attr.class]': 'part().className',
		'[attr.data-size]': 'size() === "small" ? "small" : null',
		'[attr.data-state]': 'checked() ? "checked" : "unchecked"',
		'[attr.style]': 'part().style',
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
	readonly #theme = inject(ConsentTheme);

	/** @internal */
	protected readonly part = computed(() =>
		slotPart('toggle', this.#theme.theme(), this.#noStyle(), styles.switch)
	);
}
