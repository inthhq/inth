'use client';

import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import { forwardRef as createForwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { useExitTransition } from '../use-exit-transition';

interface OverlayProps extends HTMLAttributes<HTMLDivElement> {
	noStyle?: boolean;
	isOpen: boolean;
}

const IABConsentDialogOverlay = createForwardRef<HTMLDivElement, OverlayProps>(
	({ className, style, noStyle, isOpen, ...props }, ref) => {
		const {
			disableAnimation,
			noStyle: contextNoStyle,
			scrollLock,
		} = useTheme();
		const { components } = useUIConfig();

		const isVisible = useExitTransition(isOpen, disableAnimation);

		const theme = mergeSlotProps(components?.['iab-dialog']?.overlay, {
			baseClassName: styles.overlay,
			className,
			noStyle: contextNoStyle || noStyle,
			style,
			...props,
		});

		const shouldApplyAnimation =
			!(contextNoStyle || noStyle) && !disableAnimation;

		let animationClass: string | undefined;
		if (shouldApplyAnimation) {
			animationClass = isVisible ? styles.overlayVisible : styles.overlayHidden;
		}

		const finalClassName = cn(theme.className, animationClass);

		if (!isOpen || !scrollLock) {
			return null;
		}

		return (
			<div
				ref={ref}
				{...theme}
				aria-hidden="true"
				className={finalClassName}
				data-testid="iab-consent-dialog-overlay"
			/>
		);
	}
);

IABConsentDialogOverlay.displayName = 'IABConsentDialogOverlay';

export { IABConsentDialogOverlay };
