'use client';

import { createContext } from 'react';

import type { Theme } from '~/types/theme';

/**
 * Configuration value type for the ThemeContext.
 *
 * @remarks
 * Provides type-safe theme customization options for components.
 * Supports both token-based (v2) and key-based (v1) themes.
 *
 * @public
 */
export interface ThemeContextValue {
	/**
	 * Theme configuration object for styling components
	 * @default undefined
	 */
	theme?: Theme;

	/**
	 * Disables all animations when true
	 * @remarks Useful for reduced motion preferences
	 * @default false
	 */
	disableAnimation?: boolean;

	/**
	 * Removes default styles when true
	 * @remarks Enables fully custom styling
	 * @default false
	 */
	noStyle?: boolean;

	/**
	 * Locks page scroll while a modal surface other than the stock banner
	 * and dialog is open: the IAB banner and dialog, and the opt-out and
	 * opt-in confirmations (standalone, or hosted by the dialog). The stock
	 * banner blocks only with `presentation.prompt.blockUntilChoice` (or a
	 * policy that requires it); the stock dialog always blocks.
	 * @default false
	 */
	scrollLock?: boolean;

	/**
	 * Traps focus in a modal surface other than the stock banner and
	 * dialog: the IAB banner and dialog, and the opt-out and opt-in
	 * confirmations (standalone, or hosted by the dialog). The stock banner
	 * traps focus only when it blocks (`blockUntilChoice`); the stock dialog
	 * always does.
	 * @default true
	 */
	trapFocus?: boolean;

	/**
	 * Color scheme preference. `null` when the provider leaves the class alone.
	 * @default 'system'
	 */
	colorScheme?: 'light' | 'dark' | 'system' | null;
}

/**
 * Context for providing theme values to components.
 *
 * @public
 */
export const GlobalThemeContext = createContext<ThemeContextValue>({
	colorScheme: 'system',
	disableAnimation: false,
	noStyle: false,
	scrollLock: undefined,
	theme: undefined,
	trapFocus: undefined,
});

/**
 * Context for providing theme values to components locally.
 *
 * @remarks
 * Allows for overriding theme values for specific component subtrees.
 *
 * @public
 */
export const LocalThemeContext = createContext<ThemeContextValue | null>(null);
