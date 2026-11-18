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
