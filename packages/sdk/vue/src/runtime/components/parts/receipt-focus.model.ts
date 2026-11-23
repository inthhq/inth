import type { ConsentKernel } from '@inth/sdk/engine';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import { nextTick, onMounted, watch } from 'vue';

/**
 * Kernels whose next consent dialog opens on the receipt. Keyed by
 * the kernel's events, like the confirmation registry, and spent by the
 * dialog that opens.
 */
const requests = new WeakSet<object>();

/**
 * Ask the next consent dialog to focus its receipt instead of its
 * title. The opt-out confirmation maps onto it: after an opt-out's
 * revocation reload, or a one-click opt-out link, the dialog opens on the
 * receipt that confirms the opt-out.
 *
 * @internal
 */
export const requestReceiptFocus = function requestReceiptFocus(
	kernel: ConsentKernel
): void {
	requests.add(kernel.events);
};

/**
 * Whether the dialog opening now should focus its receipt. Clears the
 * request.
 *
 * @internal
 */
export const takeReceiptFocus = function takeReceiptFocus(
	kernel: ConsentKernel
): boolean {
	return requests.delete(kernel.events);
};

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
