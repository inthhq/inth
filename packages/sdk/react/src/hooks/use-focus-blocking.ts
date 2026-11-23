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
 * `scrollLock` and `trapFocus` props, or the provider's, as the
 * presentation's `blocking`. A component's own props win; the provider's
 * apply only where the presentation asks for nothing explicit, so
 * `presentation.prompt.blocking` keeps beating them.
 *
 * @internal
 */
export const useFocusBlocking = function useFocusBlocking(
	surface: 'prompt' | 'preferences',
	scrollLock: boolean | undefined,
	trapFocus: boolean | undefined
): boolean | undefined {
	const theme = useContext(GlobalThemeContext);
	const presentation = useResolvedPresentation()?.[surface];
	const local = fromFocusOptions(scrollLock, trapFocus);
	if (local !== undefined) {
		return local;
	}
	const explicit =
		(presentation as { blockUntilChoice?: boolean } | undefined)
			?.blockUntilChoice ?? presentation?.blocking;
	return explicit === undefined
		? fromFocusOptions(theme.scrollLock, theme.trapFocus)
		: undefined;
};
