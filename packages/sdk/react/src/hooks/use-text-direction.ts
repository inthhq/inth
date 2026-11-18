'use client';

import { getTextDirection, setupTextDirection } from '@inth/sdk/ui/utils';
import { useEffect, useMemo } from 'react';

/**
 * Manage text direction based on the language.
 * React wrapper for `@inth/sdk/ui` text direction utilities.
 */
export const useTextDirection = function useTextDirection(language?: string) {
	const textDirection = useMemo(() => getTextDirection(language), [language]);

	useEffect(() => setupTextDirection(language), [language]);

	return textDirection;
};
