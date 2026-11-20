'use client';

import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { useEffect, useState } from 'react';
import type { FC, PropsWithChildren } from 'react';

import { useOptOutConfirmationOpen } from '~/hooks/use-opt-out';
import { useTheme } from '~/hooks/use-theme';
import type { ThemeValue } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

export type OptOutConfirmationOverlayProps = PropsWithChildren<{
	style?: ThemeValue;
	noStyle?: boolean;
	open?: boolean;
}>;

export const OptOutConfirmationOverlay: FC<OptOutConfirmationOverlayProps> = ({
	noStyle,
	style,
	open,
}) => {
	const confirmationOpen = useOptOutConfirmationOpen();
	const { components } = useUIConfig();
	const { disableAnimation, noStyle: isThemeNoStyle } = useTheme();

	const showDialog = open ?? confirmationOpen;
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (showDialog) {
			const frame = requestAnimationFrame(() => setIsVisible(true));
			return () => cancelAnimationFrame(frame);
		}
		if (disableAnimation) {
			const frame = requestAnimationFrame(() => setIsVisible(false));
			return () => cancelAnimationFrame(frame);
		}
		const animationDurationMs = Number.parseInt(
			getComputedStyle(document.documentElement).getPropertyValue(
				'--opt-out-confirmation-animation-duration'
			) || '200',
			10
		);
		const timer = setTimeout(() => {
			setIsVisible(false);
		}, animationDurationMs);
		return () => clearTimeout(timer);
	}, [showDialog, disableAnimation]);

	const customClassName = typeof style === 'string' ? style : style?.className;
	const finalNoStyle = Boolean(isThemeNoStyle || noStyle);

	const theme = mergeSlotProps(components?.['opt-out-confirmation']?.overlay, {
		baseClassName: styles.overlay,
		className: customClassName,
		noStyle: finalNoStyle,
		style:
			typeof style === 'object' && 'style' in style ? style.style : undefined,
	});

	const shouldApplyAnimation = !finalNoStyle && !disableAnimation;
	let animationClass: string | undefined;
	if (shouldApplyAnimation) {
		animationClass = isVisible ? styles.overlayVisible : styles.overlayHidden;
	}

	return (
		<div
			{...theme}
			aria-hidden="true"
			className={cn(theme.className, animationClass)}
			data-disable-animation={disableAnimation ? '' : undefined}
			data-state={showDialog ? 'open' : 'closed'}
			data-testid="opt-out-confirmation-overlay"
			role="presentation"
		/>
	);
};

export { OptOutConfirmationOverlay as Overlay };
