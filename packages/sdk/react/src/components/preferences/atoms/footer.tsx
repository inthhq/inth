import actionStyles from '@inth/sdk/ui/styles/components/consent-actions';
import styles from '@inth/sdk/ui/styles/components/consent-manager';
import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/use-ui-config';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { Box } from '../../shared/primitives/box';
import type { BoxProps } from '../../shared/primitives/box';

/**
 * Footer component for consent management actions.
 */
export const ConsentWidgetFooter = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, className, style, ...props }, ref) => {
	const { components } = useUIConfig();
	const { noStyle } = useTheme();
	const actionProps = mergeSlotProps(components?.manager?.actions, {
		baseClassName: className,
		noStyle,
		style,
		...props,
	});

	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.footer}
			data-testid="consent-widget-footer"
			{...actionProps}
			slotKey="manager.footer"
		>
			{children}
		</Box>
	);
});
ConsentWidgetFooter.displayName = 'ConsentWidgetFooter';

export const ConsentWidgetFooterSubGroup = createForwardRef<
	HTMLDivElement,
	BoxProps
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={actionStyles.actionGroup}
		data-testid="consent-widget-footer-sub-group"
		{...props}
		slotKey="manager.actionGroup"
	>
		{children}
	</Box>
));
ConsentWidgetFooterSubGroup.displayName = 'ConsentWidgetFooterSubGroup';

const Footer = ConsentWidgetFooter;
const FooterSubGroup = ConsentWidgetFooterSubGroup;

export { Footer, FooterSubGroup };
