import type { ConsentComponentSlotKey } from '@inth/sdk/schema/config';
import type { ButtonMode } from '@inth/sdk/ui/styles/primitives';
import type { ComponentRef, HTMLAttributes, MouseEvent } from 'react';

import type { CSSVariables, ExtendThemeKeys } from '~/types/theme';

export type ConsentButtonElement = ComponentRef<'button'>;

/**
 * Props for the stock consent buttons.
 *
 * @public
 */
export interface ConsentButtonProps
	extends
		Omit<HTMLAttributes<HTMLButtonElement>, 'style'>,
		ExtendThemeKeys<CSSVariables> {
	slotKey?: ConsentComponentSlotKey;
	/**
	 * @remarks
	 * When true, the button will not apply any styles.
	 */
	noStyle?: boolean;
	/**
	 * @remarks
	 * When true, the button will render its children directly without wrapping them in a button element.
	 */
	asChild?: boolean;
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	/**
	 * @remarks
	 * The visual variant of the button.
	 * @default 'neutral'
	 */
	variant?: 'primary' | 'neutral';
	/**
	 * @remarks
	 * The visual mode of the button.
	 * @default 'stroke'
	 */
	mode?: ButtonMode;
	/**
	 * @remarks
	 * Semantic consent action type for theme-based button styling.
	 */
	consentAction?: 'accept' | 'reject' | 'customize' | 'dismiss' | 'save';
	/**
	 * @remarks
	 * Whether this button is the primary action for the current surface.
	 */
	isPrimary?: boolean;
}
