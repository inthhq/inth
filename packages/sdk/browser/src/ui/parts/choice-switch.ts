import { classes as dialogStyles } from '../../generated/ui/dialog';
import { el } from './el';
import type { PartProps } from './el';

/** What {@link choiceSwitch} renders. */
export interface ChoiceSwitchParams {
	checked: boolean;
	onChange: (checked: boolean) => void;
	/** The vendor table's switches are smaller. */
	size?: 'default' | 'small';
	noStyle: boolean;
	attrs: PartProps;
}

/**
 * A choice switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03).
 */
export const choiceSwitch = function choiceSwitch(
	params: ChoiceSwitchParams
): HTMLButtonElement {
	return el('button', {
		...params.attrs,
		'aria-checked': params.checked ? 'true' : 'false',
		class: params.noStyle ? undefined : dialogStyles.switch,
		'data-size': params.size === 'small' ? 'small' : undefined,
		'data-state': params.checked ? 'checked' : 'unchecked',
		on: { click: () => params.onChange(!params.checked) },
		role: 'switch',
		type: 'button',
	});
};
