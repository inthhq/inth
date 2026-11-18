import styles from '@inth/sdk/ui/styles/components/consent-banner';
import { forwardRef as createForwardRef, isValidElement } from 'react';
import type { HTMLAttributes } from 'react';

import { Slot } from '~/components/shared/libs/slot';
import { useActiveUI } from '~/hooks';
import { useLateEntry } from '~/hooks/use-late-entry';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

/**
 * Props for the Overlay component.
 *
 * @remarks
 * The overlay provides a semi-transparent backdrop behind the consent banner content.
 * It can be styled using the ConsentBanner theme system or through direct style props.
 *
 * @public
 */
interface OverlayProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * @remarks
	 * When true, the component will not apply any styles.
	 */
	noStyle?: boolean;
	/**
	 * @remarks
	 * When true, the component will render its children directly without wrapping them in a DOM element.
	 * This enables better composition with other components.
	 */
	asChild?: boolean;
}

/**
 * Overlay component that provides a backdrop for the ConsentBanner content.
 *
 * @remarks
 * Renders only while the banner shows with scroll lock on, and locks page
 * scroll while it does.
 *
 * @public
 */
const ConsentBannerOverlay = createForwardRef<HTMLDivElement, OverlayProps>(
	({ className, style, noStyle, asChild, children, ...props }, ref) => {
		const activeUI = useActiveUI();
		const {
			disableAnimation,
			noStyle: contextNoStyle,
			scrollLock,
		} = useTheme();
		const { components } = useUIConfig();

		const showBanner = activeUI === 'banner';
		const theme = mergeSlotProps(components?.banner?.overlay, {
			baseClassName: styles.overlay,
			className,
			noStyle: contextNoStyle || noStyle,
			style,
			...props,
		});

		const shouldApplyAnimation =
			!(contextNoStyle || noStyle) && !disableAnimation;

		// The overlay shows on its first frame; `overlayEntering` marks the
		// mount, and with `data-entry="late"` the stylesheet fades it in.
		const animationClass = shouldApplyAnimation
			? `${styles.overlayVisible} ${styles.overlayEntering}`
			: undefined;

		const finalClassName = cn(theme.className, animationClass);

		useScrollLock(!!(showBanner && scrollLock));
		const lateEntry =
			useLateEntry(!!(showBanner && scrollLock)) && !disableAnimation;

		if (!(showBanner && scrollLock)) {
			return null;
		}
		const overlayProps = {
			...theme,
			'aria-hidden': true,
			className: finalClassName,
			'data-entry': lateEntry ? 'late' : undefined,
			'data-testid': 'consent-banner-overlay',
		};
		return asChild && isValidElement(children) ? (
			<Slot
				ref={ref}
				{...overlayProps}
			>
				{children}
			</Slot>
		) : (
			<div
				ref={ref}
				{...overlayProps}
			>
				{children}
			</div>
		);
	}
);

ConsentBannerOverlay.displayName = 'ConsentBannerOverlay';

const Overlay = ConsentBannerOverlay;

export { ConsentBannerOverlay, Overlay };
