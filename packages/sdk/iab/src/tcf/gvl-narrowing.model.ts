/**
 * Narrows an IAB TCF Global Vendor List to a publisher's vendor allowlist.
 *
 * @packageDocumentation
 */

import type { GlobalVendorList } from '@inth/sdk-core';

/**
 * Narrow a vendor list to a publisher allowlist. An empty allowlist keeps
 * every vendor.
 *
 * The GVL endpoint applies `vendorIds` server-side; a list that arrived by
 * another route (server-resolved state) is narrowed here so both paths
 * disclose the same vendors.
 *
 * @public
 */
export const narrowGVLToVendors = function narrowGVLToVendors(
	gvl: GlobalVendorList,
	vendorIds: readonly number[]
): GlobalVendorList {
	if (vendorIds.length === 0) {
		return gvl;
	}
	const allowed = new Set(vendorIds.map(String));
	const vendors: GlobalVendorList['vendors'] = {};
	for (const [id, vendor] of Object.entries(gvl.vendors)) {
		if (allowed.has(id)) {
			vendors[id] = vendor;
		}
	}
	return { ...gvl, vendors };
};
