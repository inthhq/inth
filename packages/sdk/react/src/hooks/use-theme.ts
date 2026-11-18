'use client';

import { useContext, useMemo } from 'react';

import { GlobalThemeContext, LocalThemeContext } from '~/context/theme-context';
import type { ThemeContextValue } from '~/context/theme-context';

const isIndexableObject = function isIndexableObject(
	value: unknown
): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
};

const deepMerge = function deepMerge<T extends object>(
	target: T,
	source?: Partial<T> | null
): T {
	if (!source) {
		return target;
	}

	const result = { ...target } as T;

	for (const key of Object.keys(source) as (keyof T)[]) {
		const sourceValue = source[key];
		if (sourceValue !== undefined) {
			const targetValue = target[key];
			if (
				isIndexableObject(sourceValue) &&
				!Array.isArray(sourceValue) &&
				isIndexableObject(targetValue) &&
				!Array.isArray(targetValue)
			) {
				result[key] = deepMerge(
					targetValue,
					sourceValue as Partial<typeof targetValue>
				) as T[Extract<keyof T, string>];
			} else {
				result[key] = sourceValue as T[Extract<keyof T, string>];
			}
		}
	}

	return result;
};

export const useTheme = (): ThemeContextValue => {
	const globalContext = useContext(GlobalThemeContext);
	const localContext = useContext(LocalThemeContext);

	if (!globalContext) {
		throw new Error('Theme components must be used within Theme.Root');
	}

	return useMemo(
		() => deepMerge(globalContext, localContext || null),
		[globalContext, localContext]
	);
};
