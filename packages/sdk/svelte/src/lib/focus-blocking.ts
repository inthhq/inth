import type { ConsentPresentation } from '@inth/sdk/engine';

/** The scroll and focus options a surface or the provider can set. */
export interface FocusOptions {
	readonly scrollLock?: boolean;
	readonly trapFocus?: boolean;
}

/** One blocking mode from the scroll and focus options, as one value. */
const fromFocusOptions = (options: FocusOptions): boolean | undefined =>
	options.scrollLock === false || options.trapFocus === false
		? false
		: (options.scrollLock ?? options.trapFocus);

/**
 * The blocking the IAB banner and dialog ask for through their
 * `scrollLock` and `trapFocus` props, or the provider's, as the
 * presentation's `blocking`. Explicit `blocking` (or `blockUntilChoice`) in
 * the presentation wins over both; then the component's own props, then
 * the provider's. `undefined` leaves the presentation to decide.
 *
 * @param surface - The presentation tier the surface reads.
 * @param presentation - The provider's `presentation`.
 * @param local - The component's own props.
 * @param provider - The provider's options.
 * @internal
 */
export const focusBlocking = function focusBlocking(
	surface: 'prompt' | 'preferences',
	presentation: ConsentPresentation | undefined,
	local: FocusOptions,
	provider: FocusOptions
): boolean | undefined {
	const tier = presentation?.[surface];
	const explicit =
		(tier as { blockUntilChoice?: boolean } | undefined)?.blockUntilChoice ??
		tier?.blocking;
	if (explicit !== undefined) {
		return undefined;
	}
	return fromFocusOptions(local) ?? fromFocusOptions(provider);
};
