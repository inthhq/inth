import type { ConsentKernel } from '@inth/sdk/engine';
import {
	hasOptOutConfirmationHost,
	isOptOutConfirmationOpen,
	subscribeOptOutConfirmation,
} from '@inth/sdk/surface-actions';

/**
 * Reactive runes state for the per-kernel opt-out confirmation view.
 *
 * @internal
 */
export const useOptOutConfirmationState = function useOptOutConfirmationState(
	getKernel: () => ConsentKernel
) {
	let open = $state(isOptOutConfirmationOpen(getKernel()));
	let hasStandaloneHost = $state(hasOptOutConfirmationHost(getKernel()));

	$effect(() => {
		const kernel = getKernel();
		const sync = () => {
			open = isOptOutConfirmationOpen(kernel);
			hasStandaloneHost = hasOptOutConfirmationHost(kernel);
		};
		sync();
		return subscribeOptOutConfirmation(kernel, sync);
	});

	return {
		get hasStandaloneHost() {
			return hasStandaloneHost;
		},
		get open() {
			return open;
		},
	};
};
