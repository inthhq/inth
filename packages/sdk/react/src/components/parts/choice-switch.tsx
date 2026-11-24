'use client';

import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import type { ButtonHTMLAttributes } from 'react';

import { useUIConfig } from '~/use-ui-config';
import { mergeSlotProps } from '~/utils/merge-slot-props';

/** Props for {@link ChoiceSwitch}. */
export interface ChoiceSwitchProps extends Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	'role' | 'onChange'
> {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	/** The vendor table's switches are smaller. */
	size?: 'default' | 'small';
	noStyle?: boolean;
}

/**
 * A Privacy Choices switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03); a category that cannot change shows
 * "Always on" instead of a switch. Takes the `toggle` theme slot
 * (`components.switch.root`), as the `ConsentWidget` switch does.
 *
 * @internal
 */
export const ChoiceSwitch = ({
	checked,
	onCheckedChange,
	size = 'default',
	noStyle,
	className,
	style,
	...props
}: ChoiceSwitchProps) => {
	const { components } = useUIConfig();
	return (
		<button
			{...props}
			{...mergeSlotProps(components?.switch?.root, {
				baseClassName: styles.switch,
				className,
				noStyle,
				style,
			})}
			type="button"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A switch, not a checkbox: it applies or stages at once, and screen readers announce on and off.
			role="switch"
			aria-checked={checked}
			data-size={size === 'small' ? 'small' : undefined}
			data-state={checked ? 'checked' : 'unchecked'}
			onClick={() => onCheckedChange(!checked)}
		/>
	);
};
