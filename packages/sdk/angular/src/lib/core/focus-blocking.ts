/**
 * The blocking a surface with `scrollLock` and `trapFocus` inputs asks for.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentPresentation, PromptPresentation } from '@inth/sdk/engine';

/** One blocking mode from the scroll and focus options, as one value. */
const fromFocusOptions = function fromFocusOptions(
	scrollLock: boolean | undefined,
	trapFocus: boolean | undefined
): boolean | undefined {
	return scrollLock === false || trapFocus === false
		? false
		: (scrollLock ?? trapFocus);
};

/**
 * The blocking the IAB banner and dialog ask for through their
 * `scrollLock` and `trapFocus` inputs, or the provider's, as the
 * presentation's `blocking`. Explicit `blocking` (or `blockUntilChoice`)
 * in the presentation wins over both; then the component's own inputs,
 * then the provider's. `undefined` leaves the presentation to decide.
 *
 * @internal
 */
export const focusBlocking = function focusBlocking(
	surface: 'prompt' | 'preferences',
	presentation: ConsentPresentation | undefined,
	own: { scrollLock?: boolean; trapFocus?: boolean },
	provider: { scrollLock?: boolean; trapFocus?: boolean }
): boolean | undefined {
	const tier = presentation?.[surface];
	const explicit =
		(tier as PromptPresentation | undefined)?.blockUntilChoice ??
		tier?.blocking;
	if (explicit !== undefined) {
		return undefined;
	}
	return (
		fromFocusOptions(own.scrollLock, own.trapFocus) ??
		fromFocusOptions(provider.scrollLock, provider.trapFocus)
	);
};
