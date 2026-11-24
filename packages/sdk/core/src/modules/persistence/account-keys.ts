/**
 * Storage keys for the cross-domain account consent layer.
 *
 * Kept outside `libs/storage-keys.ts` so the browser first-load deferred shell
 * does not ship account-layer key strings before the engine loads.
 *
 * @internal
 */
import { resolveStorageKeys } from '../../libs/storage-keys';
import type { StorageConfig } from './persistence.model';

/** Storage keys for the cross-domain account consent layer. */
export interface AccountStorageKeys {
	/** Compact category choices cookie (`<key>-acct-c`). */
	accountChoices: string;
	/** Compact denied vendor IDs cookie (`<key>-acct-v`). */
	accountVendors: string;
	/** Compact person-held opt-out cookie (`<key>-acct-o`). */
	accountOptOut: string;
	/** Full localStorage JSON (`<key>-acct`). */
	accountState: string;
}

/** Derive the account consent layer storage keys for `consentKey`. */
export const accountStorageKeysFor = function accountStorageKeysFor(
	consentKey: string
): AccountStorageKeys {
	return {
		accountChoices: `${consentKey}-acct-c`,
		accountOptOut: `${consentKey}-acct-o`,
		accountState: `${consentKey}-acct`,
		accountVendors: `${consentKey}-acct-v`,
	};
};

/** Resolve the account consent layer storage keys for `config`. */
export const resolveAccountStorageKeys = function resolveAccountStorageKeys(
	config?: StorageConfig
): AccountStorageKeys {
	return accountStorageKeysFor(resolveStorageKeys(config).consent);
};
