import type { ConsentKernel } from '@inth/sdk/engine';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import { nextTick, onMounted, watch } from 'vue';

import { requestReceiptFocus } from './receipt-focus.model';

/**
 * The dialog confirms an opt-out on its receipt: while `adopt` is true
 * (the opt-out confirmation is open, after a revocation reload or a
 * one-click opt-out link, and no standalone `OptOutConfirmation` shows
 * it), open the dialog there instead. Opening the dialog closes the
 * confirmation.
 *
 * The first check waits until the page has mounted, so a standalone
 * `OptOutConfirmation` rendered beside the dialog claims the confirmation
 * first.
 *
 * @internal
 */
export const useAdoptOptOutConfirmation = function useAdoptOptOutConfirmation(
	kernel: ConsentKernel,
	adopt: () => boolean
): void {
	let mounted = false;
	const run = (value: boolean) => {
		if (!value || !mounted) {
			return;
		}
		requestReceiptFocus(kernel);
		showConsentSurface(kernel, 'dialog');
	};
	watch(adopt, run);
	onMounted(() => {
		void nextTick(() => {
			mounted = true;
			run(adopt());
		});
	});
};
