'use client';

import { useContext } from 'react';

import { GlobalThemeContext } from '~/context/theme-context';

import { useResolvedPresentation } from './use-resolved-presentation';

/** One blocking mode from the scroll and focus options, as one value. */
const fromFocusOptions = (
	scrollLock: boolean | undefined,
	trapFocus: boolean | undefined
): boolean | undefined =>
	scrollLock === false || trapFocus === false
		? false
		: (scrollLock ?? trapFocus);

/**
 * The blocking the IAB banner and dialog ask for through their
 * `scrollLock` and `trapFocus` props, or the provider's. The banner passes
 * it on as `blockUntilChoice`, the dialog as `blocking`. An explicit
 * `presentation.prompt.blockUntilChoice` or `presentation.preferences.blocking`
 * wins over both; then the component's own props, then the provider's.
 *
 * @internal
 */
export const useFocusBlocking = function useFocusBlocking(
	surface: 'prompt' | 'preferences',
	scrollLock: boolean | undefined,
	trapFocus: boolean | undefined
): boolean | undefined {
	const theme = useContext(GlobalThemeContext);
	const presentation = useResolvedPresentation();
	const explicit =
		surface === 'prompt'
			? presentation?.prompt?.blockUntilChoice
			: presentation?.preferences?.blocking;
	if (explicit !== undefined) {
		return undefined;
	}
	return (
		fromFocusOptions(scrollLock, trapFocus) ??
		fromFocusOptions(theme.scrollLock, theme.trapFocus)
	);
};
