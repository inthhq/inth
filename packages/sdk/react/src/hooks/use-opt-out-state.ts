'use client';

import {
	getOptOutReceiptData,
	getServerOptOutReceiptData,
	subscribeOptOutReceiptData,
} from '@inth/sdk/surface-actions';
import { resolveOptOut } from '@inth/sdk/surface-state';
import type { OptOutState } from '@inth/sdk/surface-state';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useKernel, useKernelSelector } from '../use-kernel-selector';

/**
 * Derive the opt-out display state and receipt from the current snapshot and
 * local receipt data.
 *
 * Returns whether an opt-out is available, whether one is honored (`optedOut`),
 * how it was recorded, why this browser cannot lift it right now, affected
 * categories, the 12-month reprompt timestamp, covered scope (`browser` or
 * `account`), source, recorded time, local reference and backend-confirmed
 * rights.
 *
 * @returns The merged opt-out state and receipt.
 * @public
 */
export const useOptOutState = function useOptOutState(): OptOutState {
	const kernel = useKernel();
	const evaluationPolicy = useKernelSelector(
		(snapshot) => snapshot.evaluationPolicy
	);
	const optOut = useKernelSelector((snapshot) => snapshot.optOut);
	const privacySignals = useKernelSelector(
		(snapshot) => snapshot.privacySignals
	);
	const local = useSyncExternalStore(
		useCallback(
			(listener: () => void) => subscribeOptOutReceiptData(kernel, listener),
			[kernel]
		),
		() => getOptOutReceiptData(kernel),
		() => getServerOptOutReceiptData(kernel)
	);
	return useMemo(
		() => resolveOptOut({ evaluationPolicy, optOut, privacySignals }, local),
		[evaluationPolicy, local, optOut, privacySignals]
	);
};
