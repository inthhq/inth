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
 * `scrollLock` and `trapFocus` props, or the provider's. The banner passes
 * it on as `blockUntilChoice`, the dialog as `blocking`. An explicit
 * `presentation.prompt.blockUntilChoice` or `presentation.preferences.blocking`
 * wins over both; then the component's own props, then the provider's.
 * `undefined` leaves the presentation to decide.
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
	const explicit =
		surface === 'prompt'
			? presentation?.prompt?.blockUntilChoice
			: presentation?.preferences?.blocking;
	if (explicit !== undefined) {
		return undefined;
	}
	return fromFocusOptions(local) ?? fromFocusOptions(provider);
};
