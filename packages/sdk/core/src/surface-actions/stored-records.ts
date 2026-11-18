/**
 * Stored records for a host whose runtime has not loaded yet: how to clear
 * them.
 *
 * An entry of its own, not part of `instant-commit`: the clear brings the
 * record storage code with it, and a host that never clears before its
 * runtime loads should not carry it in its first load.
 *
 * @packageDocumentation
 * @internal
 */

import { createBrowserOutboxStore } from '../kernel/save-outbox/store';
import type { SaveOutboxStore } from '../kernel/save-outbox/store';
import { clearStoredRecords } from '../modules/persistence/clear';
import { storageFor } from '../runtime/storage-for';
import type { ConsentRuntimeOptions } from '../runtime/types';

/**
 * Clears stored records as a runtime's `clearRecords()` does, for a host
 * whose runtime has not loaded yet: queued saves dropped, every Inth
 * record removed and the
 * clear epoch stored before it returns, so a reload or teardown that comes
 * first cannot bring the cleared choice back. Nothing is cleared where the
 * runtime would not persist: disabled, under a `consentSource`, or with
 * `persistence: false`.
 *
 * @param at - When the clear happened.
 * @param outbox - The save outbox to empty. Defaults to the browser's.
 * @returns Whether storage was cleared.
 * @internal
 */
export const clearStoredRecordsFor = function clearStoredRecordsFor(
	options: Pick<
		ConsentRuntimeOptions,
		'consentSource' | 'enabled' | 'persistence' | 'storageConfig'
	>,
	at: number = Date.now(),
	outbox: SaveOutboxStore = createBrowserOutboxStore()
): boolean {
	// As the kernel does on every clear: a save an early commit queued must
	// not replay the cleared choice once the engine starts.
	outbox.clear();
	if (
		options.enabled === false ||
		options.consentSource ||
		options.persistence === false
	) {
		return false;
	}
	clearStoredRecords(storageFor(options), at, 0);
	return true;
};
