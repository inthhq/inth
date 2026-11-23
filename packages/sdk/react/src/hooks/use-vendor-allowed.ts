import { isVendorAllowed } from '@inth/sdk/engine';

import { useGateSelector } from '../use-kernel-selector';

/**
 * Whether one vendor may load: it is declared, its category condition
 * passes, and outside IAB the visitor has not turned it off.
 *
 * @param vendorId - Vendor id as declared in `vendors`, on a script or by
 * the backend.
 * @returns `true` while the vendor may load. An id nothing declares, such
 * as a typo, returns `false` and logs a development warning.
 */
export const useVendorAllowed = function useVendorAllowed(
	vendorId: string
): boolean {
	return useGateSelector((snap, now) => isVendorAllowed(snap, vendorId, now));
};
