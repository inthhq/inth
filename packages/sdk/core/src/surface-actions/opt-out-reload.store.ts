/**
 * The post-reload opt-out confirmation marker, in `sessionStorage`.
 *
 * Kept apart from `./opt-out.ts` with `./opt-out-reload.ts`, so surface
 * chunks (banner, dialog, trigger) do not pull `storage-keys` into their
 * dependency graphs.
 */

import { OPT_OUT_CONFIRMATION_STORAGE_KEY } from '../libs/storage-keys';

const readSessionStorage = (): Storage | null => {
	if (typeof window === 'undefined') {
		return null;
	}
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
};

/**
 * Record in `sessionStorage` that the next document in this tab should open
 * the opt-out confirmation view once after a revocation reload.
 *
 * Degrades silently when `sessionStorage` is blocked or unavailable.
 */
export const markPendingOptOutConfirmation =
	function markPendingOptOutConfirmation(): boolean {
		const storage = readSessionStorage();
		if (!storage) {
			return false;
		}
		try {
			storage.setItem(OPT_OUT_CONFIRMATION_STORAGE_KEY, '1');
			return true;
		} catch {
			return false;
		}
	};

/** Whether this tab has a post-reload opt-out confirmation pending. */
export const hasPendingOptOutConfirmation =
	function hasPendingOptOutConfirmation(): boolean {
		const storage = readSessionStorage();
		if (!storage) {
			return false;
		}
		try {
			return storage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY) !== null;
		} catch {
			return false;
		}
	};

/** Clear the post-reload opt-out confirmation marker for this tab. */
export const clearPendingOptOutConfirmation =
	function clearPendingOptOutConfirmation(): void {
		const storage = readSessionStorage();
		if (!storage) {
			return;
		}
		try {
			storage.removeItem(OPT_OUT_CONFIRMATION_STORAGE_KEY);
		} catch {
			// Blocked storage degrades to no confirmation after reload.
		}
	};
