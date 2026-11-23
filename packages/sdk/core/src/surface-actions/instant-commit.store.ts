/**
 * The storage an instant commit reads before it records a tap: whether a
 * clear epoch is stored, which only the kernel's records carry.
 *
 * @packageDocumentation
 * @internal
 */
import { readCookieValueFromHeader } from '../libs/cookie/read-cookie-value-from-header';
import { resolveStorageKeys } from '../libs/storage-keys';
import type { StorageConfig } from '../modules/persistence/persistence.model';

/**
 * Whether storage holds a clear epoch. A record written after a clear
 * carries it, which only persistence reads; the kernel records those.
 *
 * @param storageConfig - The runtime's storage configuration.
 * @returns `true` when a clear was stored.
 * @internal
 */
export const hasStoredClearEpoch = function hasStoredClearEpoch(
	storageConfig?: StorageConfig
): boolean {
	const key = resolveStorageKeys(storageConfig).epoch;
	try {
		if ((window.localStorage?.getItem(key) ?? null) !== null) {
			return true;
		}
	} catch {
		// Blocked storage: the cookie still tells.
	}
	try {
		return readCookieValueFromHeader(document.cookie, key) !== undefined;
	} catch {
		return false;
	}
};
