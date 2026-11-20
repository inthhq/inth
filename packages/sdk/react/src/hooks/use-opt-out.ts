'use client';

import type { OptOutResult, SaveUISource } from '@inth/sdk/engine';
import {
	hasOptOutConfirmationHost,
	isOptOutConfirmationOpen,
	optOutConsentSurface,
	subscribeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { useCallback, useSyncExternalStore } from 'react';

import { useKernel } from '../kernel-selector';

/**
 * Trigger an opt-out in one step and open the confirmation view under an
 * opt-out policy. Under any other policy model, open the preference dialog.
 *
 * @returns A stable function that records the opt-out locally without waiting
 * on the network and resolves with the kernel's {@link OptOutResult}.
 * @public
 */
export const useOptOut = function useOptOut(): (context?: {
	uiSource?: SaveUISource;
}) => Promise<OptOutResult> {
	const kernel = useKernel();
	return useCallback(
		(context?: { uiSource?: SaveUISource }) =>
			optOutConsentSurface(kernel, context),
		[kernel]
	);
};

const NOT_OPEN = () => false;

/**
 * Whether the opt-out confirmation view is currently open for the active
 * kernel.
 *
 * @internal
 */
export const useOptOutConfirmationOpen =
	function useOptOutConfirmationOpen(): boolean {
		const kernel = useKernel();
		return useSyncExternalStore(
			useCallback(
				(listener: () => void) => subscribeOptOutConfirmation(kernel, listener),
				[kernel]
			),
			() => isOptOutConfirmationOpen(kernel),
			NOT_OPEN
		);
	};

/**
 * Whether a standalone `<OptOutConfirmation />` host is mounted for the
 * active kernel.
 *
 * @internal
 */
export const useHasOptOutConfirmationHost =
	function useHasOptOutConfirmationHost(): boolean {
		const kernel = useKernel();
		return useSyncExternalStore(
			useCallback(
				(listener: () => void) => subscribeOptOutConfirmation(kernel, listener),
				[kernel]
			),
			() => hasOptOutConfirmationHost(kernel),
			NOT_OPEN
		);
	};
