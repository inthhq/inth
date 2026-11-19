/**
 * Clearing stored records: every Inth record removed, then the clear epoch
 * stored.
 *
 * First-load code, unlike the other writes in `writer/`. `clear()` runs it
 * before it returns, so a reload right after a clear, or write code that
 * never loads, cannot bring a cleared grant back. It uses only functions
 * the read path already loads.
 *
 * @internal
 */
import { IAB_STORAGE_KEYS } from '@inth/sdk-schema/types';

import {
	deleteCookie,
	deleteCookieInEveryScope,
	writeCookie,
} from '../../libs/cookie';
import { removeLegacySubjectId } from '../../libs/legacy-subject-id';
import { removeLocalStorageKey } from '../../libs/local-storage';
import {
	storageKeyFamilies,
	resolveStorageKeys,
} from '../../libs/storage-keys';
import { EPOCH_CLOCK_TOLERANCE_MS } from './record-codec';
import { readStoredClearEpoch } from './record-storage';
import type { StorageConfig } from './types';

/**
 * Removes, for the configured family and every legacy family it reads,
 * the explicit choice, the notice dismissal and the vendor denials with
 * their cookie projections and the `<key>-privacy` record an alpha may
 * have left; then the `<key>-sid` subject ID c15t 3.2 stored before any
 * choice, and the IAB records. The configured family's cookies are
 * deleted with the same domain handling as writes, so a cross-subdomain
 * cookie is actually removed; a legacy family's at every scope.
 *
 * Queued backend replays and subject reassignments are the kernel's save
 * outbox: the kernel drops them on the `records:cleared` event that follows
 * a clear.
 *
 * @internal
 */
export const clearStoredConsentRecords = function clearStoredConsentRecords(
	config?: StorageConfig
): void {
	if (typeof document === 'undefined') {
		return;
	}
	for (const [index, family] of storageKeyFamilies(
		resolveStorageKeys(config)
	).entries()) {
		const both = [
			family.consent,
			family.notice,
			family.noticeSubject,
			family.privacy,
			family.vendors,
		];
		for (const key of [...both, family.cookieMiss, family.noticeCookieMiss]) {
			removeLocalStorageKey(key);
		}
		for (const key of both) {
			// The readers take a legacy family's cookie at any scope this
			// page is sent, such as c15t's with `crossSubdomain`.
			if (index === 0) {
				deleteCookie(key, config);
			} else {
				deleteCookieInEveryScope(key, config);
			}
		}
	}
	removeLegacySubjectId(config);
	// Addon bytes must be removed even when the addon is not mounted.
	removeLocalStorageKey(IAB_STORAGE_KEYS.authority);
	removeLocalStorageKey(IAB_STORAGE_KEYS.c15tAuthority);
	for (const key of [
		IAB_STORAGE_KEYS.tcString,
		IAB_STORAGE_KEYS.additionalConsent,
	]) {
		removeLocalStorageKey(key);
		deleteCookie(key, config);
		deleteCookie(key);
	}
};

/**
 * Serializes the clear epoch record: the time of the last `clear()` in
 * epoch milliseconds, as plain decimal digits. The same text is stored in
 * the `<key>-epoch` cookie and localStorage entry.
 *
 * @internal
 */
export const encodeClearEpoch = function encodeClearEpoch(
	epoch: number
): string {
	return String(epoch);
};

/**
 * Writes the clear epoch to localStorage and its cookie. Never removed by a
 * clear, so every runtime can tell decisions made before the clear from
 * later ones.
 *
 * @internal
 */
export const writeStoredClearEpoch = function writeStoredClearEpoch(
	epoch: number,
	config: StorageConfig | undefined
): void {
	const key = resolveStorageKeys(config).epoch;
	const text = encodeClearEpoch(epoch);
	try {
		window.localStorage?.setItem(key, text);
	} catch {
		// Blocked or full storage: the cookie copy still carries the epoch.
	}
	writeCookie(key, text, config);
};

/**
 * Remove every stored record and store the clear epoch for a clear made at
 * `at`. A no-op without a document.
 *
 * @param knownEpoch - The newest epoch the caller has read, so the new one
 * is past it even when storage lost it.
 * @internal
 */
export const clearStoredRecords = function clearStoredRecords(
	config: StorageConfig | undefined,
	at: number,
	knownEpoch: number
): void {
	if (typeof document === 'undefined') {
		return;
	}
	clearStoredConsentRecords(config);
	// The epoch outlives the clear it records: decisions confirmed before it
	// stay void wherever another runtime writes them back. Always past the
	// previous epoch, even when the clock went back: a lower epoch would let
	// decisions between the two back in.
	const previous = Math.max(knownEpoch, readStoredClearEpoch(config, at));
	// Never further ahead of the clock than readers accept, or every runtime
	// whose clock is behind would read the epoch as corrupt (0) and void
	// nothing. Known limit: after the clock went back more than the
	// tolerance, the capped epoch is below times cleared records carried, so
	// a decision with such a time that a runtime which missed the clear
	// writes back counts again once clocks recover. Times alone cannot order
	// that case.
	writeStoredClearEpoch(
		Math.max(at, Math.min(previous + 1, at + EPOCH_CLOCK_TOLERANCE_MS)),
		config
	);
};
