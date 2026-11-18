/**
 * Whether one declared vendor may load, given the category permissions to
 * read.
 *
 * `isVendorAllowed` (`./has.ts`) reads the permissions at a gate clock,
 * which can mean evaluating the consent record again. A surface that reads
 * the snapshot as it was evaluated needs none of that, so this module
 * holds the shared rule without the evaluator: a bundler places whole
 * modules, and the stock surfaces read vendors on first paint.
 *
 * @packageDocumentation
 */

import type { ConsentState } from '../consent/compliance';
import { has } from '../libs/has';
import { isProductionBuild } from '../libs/is-production';
import type { ConsentSnapshot } from '../types';
import { isVendorDenied } from './vendor-denial';

/** Undeclared vendor ids already warned about, so each warns once. */
const warnedUndeclaredVendors = new Set<string>();

const warnUndeclaredVendor = function warnUndeclaredVendor(
	vendorId: string
): void {
	if (isProductionBuild() || warnedUndeclaredVendors.has(vendorId)) {
		return;
	}
	warnedUndeclaredVendors.add(vendorId);
	console.warn(
		`[inth] Vendor "${vendorId}" is not declared, so it reads as not allowed. Add { id: '${vendorId}', category: ... } to the vendors option, or put vendor: '${vendorId}' on the script that loads it.`
	);
};

/**
 * The rule `isVendorAllowed` applies: declared, not turned off outside
 * IAB, and its category condition holds under `permissions`.
 *
 * @param snapshot - Immutable kernel snapshot.
 * @param vendorId - Vendor id as declared.
 * @param permissions - Reads the category permissions to check against;
 * only called for a declared vendor that is not turned off.
 * @returns `true` when the vendor is declared and its condition holds.
 * @internal
 */
export const vendorAllowedUnder = function vendorAllowedUnder(
	snapshot: ConsentSnapshot,
	vendorId: string,
	permissions: () => ConsentState
): boolean {
	const vendor = snapshot.vendors?.declared.find(
		(entry) => entry.id === vendorId
	);
	if (!vendor) {
		if (!snapshot.policyPending) {
			warnUndeclaredVendor(vendorId);
		}
		return false;
	}
	if (snapshot.model !== 'iab' && isVendorDenied(snapshot, vendorId)) {
		return false;
	}
	try {
		return has(vendor.category, permissions());
	} catch {
		return false;
	}
};

/**
 * `isVendorAllowed` at the snapshot's own clock (`evaluatedAt`): the
 * permissions the snapshot already holds, with no re-evaluation. The
 * answer `isVendorAllowed(snapshot, vendorId, snapshot.evaluatedAt)` gives.
 *
 * @param snapshot - Immutable kernel snapshot.
 * @param vendorId - Vendor id as declared.
 * @returns `true` when the vendor is declared and allowed in `snapshot`.
 * @internal
 */
export const isSnapshotVendorAllowed = function isSnapshotVendorAllowed(
	snapshot: ConsentSnapshot,
	vendorId: string
): boolean {
	return vendorAllowedUnder(
		snapshot,
		vendorId,
		() => snapshot.effectivePermissions as ConsentState
	);
};
