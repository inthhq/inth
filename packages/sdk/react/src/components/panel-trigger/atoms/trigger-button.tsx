'use client';

import { resolveOptOutLink } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
import { forwardRef as createForwardRef } from 'react';
import type { FocusEvent, MouseEvent, PointerEvent, ReactNode } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { useTriggerLabels } from '~/component-hooks/use-trigger-labels';
import { usePolicyRule, useResolvedPresentation } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/use-ui-config';
import { mergeSlotProps } from '~/utils/merge-slot-props';
import { useIdleDialogWarming } from '~/use-idle-dialog-warming';
import { warmDialogChunk } from '~/warm-dialog-chunk';

import type {
	CornerPosition,
	TriggerSize,
} from '../consent-dialog-trigger.model';
import { useTriggerContext } from './trigger-root';

const cornerClassMap = {
	'bottom-left': styles.bottomLeft,
	'bottom-right': styles.bottomRight,
	'top-left': styles.topLeft,
	'top-right': styles.topRight,
} as const satisfies Record<CornerPosition, string | undefined>;

const sizeClassMap = {
	lg: styles.lg,
	md: styles.md,
	sm: styles.sm,
} as const;

export interface TriggerButtonProps {
	children: ReactNode;

	/**
	 * Size of the trigger button.
	 * @default 'md'
	 */
	size?: TriggerSize;

	/**
	 * Accessible label for the button. Defaults to the `trigger.label`
	 * translation ("Open privacy settings").
	 */
	ariaLabel?: string;

	className?: string;

	/**
	 * When true, removes default styling.
	 * @default false
	 */
	noStyle?: boolean;

	'data-testid'?: string;
}

/**
 * The clickable button element for the trigger.
 *
 * @example
 * ```tsx
 * <ConsentDialogTrigger.Button>
 *   <ConsentDialogTrigger.Icon />
 *   <span>Privacy Settings</span>
 * </ConsentDialogTrigger.Button>
 * ```
 */
export const TriggerButton = createForwardRef<
	HTMLButtonElement,
	TriggerButtonProps
>(
	(
		{
			children,
			size = 'md',
			ariaLabel,
			className,
			'data-testid': dataTestId = 'consent-dialog-trigger',
			noStyle,
		},
		ref
	) => {
		const policy = usePolicyRule();
		const translations = useTranslations();
		const presentation = useResolvedPresentation();
		const triggerLabels = useTriggerLabels();
		const { components } = useUIConfig();
		const { disableAnimation, noStyle: contextNoStyle } = useTheme();
		const {
			corner,
			isDragging,
			isOptOut,
			isSnapping,
			endsDrag,
			handlers,
			dragStyle,
			openDialog,
		} = useTriggerContext();
		const defaultLabel = isOptOut
			? resolveOptOutLink(translations, presentation?.optOutLink).label
			: triggerLabels.label;

		// The trigger only opens the dialog, so it preloads it like every other
		// dialog opener: in idle time while mounted, and on hover or focus.
		useIdleDialogWarming(true);

		const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
			if (endsDrag(event)) {
				return;
			}
			openDialog();
		};

		const finalNoStyle = noStyle ?? contextNoStyle;
		const buttonStyle = mergeSlotProps(components?.trigger?.root, {
			baseClassName: [
				styles.trigger,
				cornerClassMap[corner],
				sizeClassMap[size],
				isDragging && styles.dragging,
				isSnapping && styles.snapping,
			],
			className,
			'data-testid': dataTestId,
			noStyle: finalNoStyle,
			style: dragStyle,
			...handlers,
		});

		// These replace the `trigger.root` slot's handlers in `buttonStyle`, so
		// they call them before warming the dialog chunk.
		const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
			buttonStyle.onFocus?.(event);
			warmDialogChunk();
		};
		const handlePointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
			buttonStyle.onPointerEnter?.(event);
			warmDialogChunk();
		};

		return (
			<button
				{...buttonStyle}
				ref={ref}
				type="button"
				data-inth-trigger="true"
				data-inth-rights={policy.rights.join(' ')}
				// Stops the hover and snap transitions, as on the other surfaces.
				data-disable-animation={disableAnimation ? '' : undefined}
				aria-label={ariaLabel ?? defaultLabel}
				onClick={handleClick}
				onFocus={handleFocus}
				onPointerEnter={handlePointerEnter}
			>
				{children}
			</button>
		);
	}
);

TriggerButton.displayName = 'ConsentDialogTrigger.Button';
