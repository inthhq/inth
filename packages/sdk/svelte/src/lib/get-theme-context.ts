import { getContext, setContext } from 'svelte';

import type { ThemeContextValue } from './consent-context.model';

const THEME_CONTEXT_KEY = Symbol('inth-v3-theme');

export const setThemeContext = function setThemeContext(
	value: ThemeContextValue
): void {
	setContext(THEME_CONTEXT_KEY, value);
};

export const getThemeContext = function getThemeContext(): ThemeContextValue {
	return (
		getContext<ThemeContextValue | undefined>(THEME_CONTEXT_KEY) ?? {
			colorScheme: 'system',
			disableAnimation: false,
			noStyle: false,
			scrollLock: undefined,
			trapFocus: undefined,
		}
	);
};
