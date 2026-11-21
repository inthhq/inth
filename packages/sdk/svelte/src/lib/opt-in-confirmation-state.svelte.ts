import type { ConsentKernel } from '@inth/sdk/engine';
import {
	claimOptInConfirmationHost,
	isActiveOptInConfirmationHost,
	isOptInConfirmationOpen,
	subscribeOptInConfirmation,
} from '@inth/sdk/surface-actions';

/**
 * Claim a host slot for the two-step opt-in confirmation dialog and track
 * whether this host should render it right now.
 *
 * @internal
 */
export const useOptInConfirmationHost = function useOptInConfirmationHost(
	getKernel: () => ConsentKernel
) {
	const token = Symbol('OptInConfirmation');
	let active = $state(false);

	$effect(() => {
		const kernel = getKernel();
		const releaseHost = claimOptInConfirmationHost(kernel, token);
		const sync = () => {
			active =
				isOptInConfirmationOpen(kernel) &&
				isActiveOptInConfirmationHost(kernel, token);
		};
		sync();
		const unsubscribe = subscribeOptInConfirmation(kernel, sync);
		return () => {
			unsubscribe();
			releaseHost();
		};
	});

	return {
		get active() {
			return active;
		},
	};
};
