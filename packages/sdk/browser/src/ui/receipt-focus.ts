/**
 * Kernels whose next Privacy Choices dialog opens on the receipt, as
 * `receipt-focus.ts` is in `@inth/react`. Keyed by the kernel's events,
 * like the confirmation registry, and spent by the dialog that opens.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentKernel } from '@inth/sdk-core';

const requests = new WeakSet<object>();

/**
 * Ask the next Privacy Choices dialog to focus its receipt instead of its
 * title. The opt-out confirmation maps onto it: after an opt-out's
 * revocation reload, or a one-click opt-out link, the dialog opens on the
 * receipt that confirms the opt-out.
 */
export const requestReceiptFocus = function requestReceiptFocus(
	kernel: ConsentKernel
): void {
	requests.add(kernel.events);
};

/** Whether the dialog opening now should focus its receipt. Clears the request. */
export const takeReceiptFocus = function takeReceiptFocus(
	kernel: ConsentKernel
): boolean {
	return requests.delete(kernel.events);
};
