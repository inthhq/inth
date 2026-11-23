/**
 * What the init script reads from `sessionStorage`: whether an opt-out
 * confirmation waits to show after a reload, which only the engine
 * renders.
 *
 * @packageDocumentation
 * @internal
 */

import { OPT_OUT_CONFIRMATION_STORAGE_KEY } from '@inth/sdk-core';

/**
 * Whether an opt-out confirmation waits to show after a reload.
 *
 * @returns `false` when `sessionStorage` is blocked.
 */
export const hasPendingOptOutConfirmation =
	function hasPendingOptOutConfirmation(): boolean {
		try {
			return (
				window.sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY) !== null
			);
		} catch {
			// Blocked sessionStorage degrades to no confirmation after reload.
			return false;
		}
	};
