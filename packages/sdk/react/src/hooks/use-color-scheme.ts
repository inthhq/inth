'use client';

import { setupColorScheme } from '@inth/sdk/ui/utils/color-scheme';
import { useEffect } from 'react';

export type ColorScheme = 'light' | 'dark' | 'system' | null;

/**
 * Manage color scheme preferences for components.
 * React wrapper for `@inth/sdk/ui` setupColorScheme.
 */
export const useColorScheme = function useColorScheme(
	colorScheme?: ColorScheme
) {
	useEffect(() => setupColorScheme(colorScheme), [colorScheme]);
};
