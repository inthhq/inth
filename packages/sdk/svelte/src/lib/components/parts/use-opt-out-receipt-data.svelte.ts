import {
	getOptOutReceiptData,
	getServerOptOutReceiptData,
	subscribeOptOutReceiptData,
} from '@inth/sdk/surface-actions';
import type { OptOutReceiptData } from '@inth/sdk/surface-state';

import { getConsentContext } from '../../get-consent-context.svelte';

/**
 * This browser's local opt-out receipt data, which says whether a backend
 * answer confirmed the held record's rights.
 *
 * It starts from the data the server rendered with, so hydration adopts
 * the server's markup, and follows this browser's own data once mounted,
 * as React's `useSyncExternalStore` does.
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const useOptOutReceiptData = function useOptOutReceiptData(): {
	readonly current: Readonly<OptOutReceiptData>;
} {
	const consent = getConsentContext();
	let current = $state.raw(getServerOptOutReceiptData(consent.kernel));
	$effect(() => {
		const { kernel } = consent;
		current = getOptOutReceiptData(kernel);
		return subscribeOptOutReceiptData(kernel, () => {
			current = getOptOutReceiptData(kernel);
		});
	});
	return {
		get current() {
			return current;
		},
	};
};
