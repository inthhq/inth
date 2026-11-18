/**
 * Vendor denials a gate honors.
 *
 * A module of its own so the stock surfaces, which read denials on first
 * paint, do not carry gate evaluation with them: a bundler places whole
 * modules. `./category-gate` re-exports everything here.
 *
 * @packageDocumentation
 */

import type { ConsentSnapshot } from '../types';

/**
 * Ids the subject turned off that a gate should honor, or `null` when
 * nothing is denied. Only a vendor currently declared and not `disabled`
 * counts: for anything else the visitor has no switch to grant it again, so
 * a denial recorded earlier would block it with no way back short of a bulk
 * action. A vendor removed from every declaration therefore follows its
 * category again, the same as one never declared.
 * @returns Denied vendor ids, or `null`.
 */
export const deniedVendorIds = function deniedVendorIds(
	snapshot: Pick<ConsentSnapshot, 'vendorChoice' | 'vendors'>
): ReadonlySet<string> | null {
	const denied = snapshot.vendorChoice?.denied;
	if (!denied || denied.length === 0) {
		return null;
	}
	const toggleable = new Set<string>();
	for (const vendor of snapshot.vendors?.declared ?? []) {
		if (vendor.disabled !== true) {
			toggleable.add(vendor.id);
		}
	}
	const ids = new Set<string>();
	for (const id of denied) {
		if (toggleable.has(id)) {
			ids.add(id);
		}
	}
	return ids.size > 0 ? ids : null;
};

/**
 * Whether the subject turned a vendor off. Unknown ids are granted: a
 * denial only counts for a vendor the subject can still see and switch.
 * @returns `true` while the vendor is denied.
 */
export const isVendorDenied = function isVendorDenied(
	snapshot: Pick<ConsentSnapshot, 'vendorChoice' | 'vendors'>,
	vendor: string
): boolean {
	return deniedVendorIds(snapshot)?.has(vendor) ?? false;
};
