/**
 * The page's localStorage, or `null` on a server or where reading it
 * throws, as blocked storage does.
 *
 * @internal
 */
export const localStorageOf = function localStorageOf(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
};

/**
 * Removes `key` from `window.localStorage`. A no-op on a server or where
 * storage is blocked, which holds nothing to remove.
 *
 * @internal
 */
export const removeLocalStorageKey = function removeLocalStorageKey(
	key: string
): void {
	try {
		window.localStorage?.removeItem(key);
	} catch {
		// Blocked storage: the read path reports it.
	}
};
