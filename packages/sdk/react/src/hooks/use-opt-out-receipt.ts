'use client';

import {
	getOptOutReceiptData,
	getServerOptOutReceiptData,
	subscribeOptOutReceiptData,
} from '@inth/sdk/surface-actions';
import { resolveOptOutReceipt } from '@inth/sdk/surface-state';
import type { OptOutReceipt } from '@inth/sdk/surface-state';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useKernel, useKernelSelector } from '../kernel-selector';

/**
 * Derive the opt-out receipt from the current snapshot and local receipt data:
 * whether an opt-out is held, whether it covers this browser or the account,
 * how it reached this browser, when it was recorded, the local reference (if
 * this browser recorded it), and confirmed rights safe to name.
 *
 * @returns The resolved opt-out receipt.
 * @public
 */
export const useOptOutReceipt = function useOptOutReceipt(): OptOutReceipt {
	const kernel = useKernel();
	const optOut = useKernelSelector((snapshot) => snapshot.optOut);
	const local = useSyncExternalStore(
		useCallback(
			(listener: () => void) => subscribeOptOutReceiptData(kernel, listener),
			[kernel]
		),
		() => getOptOutReceiptData(kernel),
		() => getServerOptOutReceiptData(kernel)
	);
	return useMemo(
		() => resolveOptOutReceipt({ optOut }, local),
		[local, optOut]
	);
};
