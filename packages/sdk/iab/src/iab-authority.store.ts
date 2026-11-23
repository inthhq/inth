import type { KernelIABAuthority } from '@inth/sdk-core';
import { IAB_STORAGE_KEYS } from '@inth/sdk-schema/types';

/**
 * The stored receipt text, or `null` when there is none or no storage.
 * Without an Inth receipt, c15t's is read where it is: a c15t page on the
 * same origin keeps it, and withdraws it when its TC string goes.
 */
export const readAuthorityReceiptText = function readAuthorityReceiptText():
	| string
	| null {
	try {
		return (
			localStorage.getItem(IAB_STORAGE_KEYS.authority) ??
			localStorage.getItem(IAB_STORAGE_KEYS.c15tAuthority)
		);
	} catch {
		return null;
	}
};

/** Whether Inth's own receipt is stored. */
export const hasOwnReceipt = function hasOwnReceipt(): boolean {
	try {
		return localStorage.getItem(IAB_STORAGE_KEYS.authority) !== null;
	} catch {
		return false;
	}
};

/** Reads the addon receipt without writing or extending its lifetime. */
export const readAuthorityReceipt = function readAuthorityReceipt(
	text = readAuthorityReceiptText()
): unknown {
	try {
		return JSON.parse(text ?? 'null');
	} catch {
		return null;
	}
};

/** Stores only confirmed authority, separately from editable IAB maps. */
export const storeAuthority = function storeAuthority(
	authority: KernelIABAuthority
): void {
	try {
		localStorage.setItem(
			IAB_STORAGE_KEYS.authority,
			JSON.stringify({
				...authority,
				customConsents: authority.vendorConsents,
				customLegitimateInterests: authority.vendorLegitimateInterests,
			})
		);
	} catch {
		// Storage can be unavailable while the in-memory confirmation remains valid.
	}
};

/**
 * Removes the addon receipt, and c15t's with it, when authority is cleared
 * by a lifecycle change. With `expected`, only while storage still holds
 * that text, so a receipt another tab stored since is kept.
 *
 * The comparison is best effort. localStorage has no conditional removal,
 * and a tab reads its own copy of the shared area, which another tab's
 * write reaches asynchronously. A receipt stored in another tab just before
 * this call can therefore still be removed. That fails toward less
 * permission: the removal withdraws the held TC string in every other tab
 * (see the receipt listener in `index.ts`) until the next save.
 */
export const clearAuthorityReceipt = function clearAuthorityReceipt(
	expected?: string
): void {
	try {
		if (expected === undefined || readAuthorityReceiptText() === expected) {
			localStorage.removeItem(IAB_STORAGE_KEYS.authority);
			localStorage.removeItem(IAB_STORAGE_KEYS.c15tAuthority);
		}
	} catch {
		/* Storage may be unavailable. */
	}
};
