'use client';

import { resolvePreferenceControlLabels } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Slot } from '~/components/shared/libs/slot';
import { useSetActiveUI } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/use-ui-config';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

const PREFERENCES_HASH = '#inth-preferences';

export interface OptOutConfirmationPreferencesLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
	asChild?: boolean;
	children?: ReactNode;
	noStyle?: boolean;
}

const OptOutConfirmationPreferencesLink = createForwardRef<
	HTMLAnchorElement,
	OptOutConfirmationPreferencesLinkProps
>(
	(
		{ children, asChild, className, style, noStyle, onClick, ...props },
		ref
	) => {
		const translations = useTranslations();
		const controls = resolvePreferenceControlLabels(translations);
		const setActiveUI = useSetActiveUI();
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const mergedProps = mergeSlotProps(
			getSlotProps(components, 'opt-out-confirmation.preferencesLink'),
			{
				baseClassName: styles.preferencesLink,
				className,
				noStyle: Boolean(noStyle ?? contextNoStyle),
				style,
			}
		);
		const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
			onClick?.(event);
			if (!event.defaultPrevented) {
				event.preventDefault();
				setActiveUI('dialog');
			}
		};
		const Comp = asChild ? Slot : 'a';
		return (
			<Comp
				ref={ref}
				href={asChild ? undefined : PREFERENCES_HASH}
				{...mergedProps}
				data-testid="opt-out-confirmation-preferences-link"
				onClick={handleClick}
				{...props}
			>
				{children ?? controls.preferences}
			</Comp>
		);
	}
);
OptOutConfirmationPreferencesLink.displayName =
	'OptOutConfirmationPreferencesLink';

export {
	OptOutConfirmationPreferencesLink as PreferencesLink,
	OptOutConfirmationPreferencesLink,
};
