'use client';

import type { UIOptions } from '@inth/sdk/ui/theme';

import { useReducedMotion } from './use-reduced-motion';
import { useTheme } from './use-theme';

/**
 * Subset of UIOptions that can be overridden at the component level.
 *
 * @public
 */
export type ComponentConfig = Pick<
	UIOptions,
	'noStyle' | 'disableAnimation' | 'scrollLock' | 'trapFocus'
>;

/**
 * Required version of ComponentConfig with all props defined.
 * @public
 */
export type ResolvedComponentConfig = Required<ComponentConfig>;

/**
 * Component props over the provider's theme settings. When neither sets
 * `disableAnimation`, the visitor's `prefers-reduced-motion` decides.
 *
 * @public
 */
export const useComponentConfig = function useComponentConfig(
	localOverrides?: ComponentConfig
): ResolvedComponentConfig {
	const globalTheme = useTheme();
	const prefersReducedMotion = useReducedMotion();

	return {
		disableAnimation:
			localOverrides?.disableAnimation ??
			globalTheme.disableAnimation ??
			prefersReducedMotion,
		noStyle: localOverrides?.noStyle ?? globalTheme.noStyle ?? false,
		scrollLock: localOverrides?.scrollLock ?? globalTheme.scrollLock ?? false,
		trapFocus: localOverrides?.trapFocus ?? globalTheme.trapFocus ?? true,
	};
};
