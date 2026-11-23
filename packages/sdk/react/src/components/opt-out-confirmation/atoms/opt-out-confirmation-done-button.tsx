'use client';

import { closeOptOutConfirmation } from '@inth/sdk/surface-actions';
import {
resolveOptOutCopy
} from '@inth/sdk/surface-state';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import { forwardRef as createForwardRef } from 'react';
import type {
ButtonHTMLAttributes,MouseEvent
} from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Slot } from '~/components/shared/libs/slot';
import { useTheme } from '~/hooks/use-theme';
import { useKernel } from '~/use-kernel';
import { useUIConfig } from '~/use-ui-config';
import { getSlotProps,mergeSlotProps } from '~/utils/merge-slot-props';

export interface OptOutConfirmationDoneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	asChild?: boolean;
	noStyle?: boolean;
}

const OptOutConfirmationDoneButton = createForwardRef<
	HTMLButtonElement,
	OptOutConfirmationDoneButtonProps
>(
	(
		{ children, asChild, className, style, noStyle, onClick, ...props },
		ref
	) => {
		const kernel = useKernel();
		const translations = useTranslations();
		const optOutCopy = resolveOptOutCopy(translations);
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const finalNoStyle = Boolean(noStyle ?? contextNoStyle);
		const primaryProps = mergeSlotProps(
			getSlotProps(components, 'button.primary'),
			{
				baseClassName: buttonStyles.button,
				noStyle: finalNoStyle,
			}
		);
		const mergedProps = mergeSlotProps(
			getSlotProps(components, 'opt-out-confirmation.doneButton'),
			{
				baseClassName: primaryProps.className,
				className,
				noStyle: finalNoStyle,
				style: { ...primaryProps.style, ...style },
			}
		);
		const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
			onClick?.(event);
			if (!event.defaultPrevented) {
				closeOptOutConfirmation(kernel);
			}
		};
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp
				ref={ref}
				type={asChild ? undefined : 'button'}
				data-mode={finalNoStyle ? undefined : 'filled'}
				data-size={finalNoStyle ? undefined : 'small'}
				data-variant={finalNoStyle ? undefined : 'primary'}
				{...mergedProps}
				data-testid="opt-out-confirmation-done-button"
				onClick={handleClick}
				{...props}
			>
				{children ?? optOutCopy.done}
			</Comp>
		);
	}
);
OptOutConfirmationDoneButton.displayName = 'OptOutConfirmationDoneButton';

export { OptOutConfirmationDoneButton as DoneButton, OptOutConfirmationDoneButton };
