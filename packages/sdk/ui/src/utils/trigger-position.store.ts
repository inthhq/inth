/**
 * The corner the floating trigger was dragged to, kept in localStorage for
 * the next page load.
 *
 * @packageDocumentation
 */

import type { CornerPosition } from './trigger-drag.model';

const STORAGE_KEY = 'inth-trigger-position';

/**
 * Persists the trigger position to localStorage.
 *
 * @remarks
 * Silently fails if localStorage is not available (e.g., in SSR or private browsing).
 */
export const persistPosition = function persistPosition(
	corner: CornerPosition,
	storageKey: string = STORAGE_KEY
): void {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(storageKey, corner);
		}
	} catch {
		// Silently fail - localStorage may not be available
	}
};

/**
 * Retrieves the persisted trigger position from localStorage.
 *
 * @remarks
 * Returns null if localStorage is not available or the stored value is invalid.
 */
export const getPersistedPosition = function getPersistedPosition(
	storageKey: string = STORAGE_KEY
): CornerPosition | null {
	try {
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(storageKey);
			if (
				stored === 'bottom-right' ||
				stored === 'top-right' ||
				stored === 'bottom-left' ||
				stored === 'top-left'
			) {
				return stored;
			}
		}
	} catch {
		// Silently fail - localStorage may not be available
	}
	return null;
};
