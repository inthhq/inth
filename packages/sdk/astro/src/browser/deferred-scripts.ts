/**
 * Which of the site's `scripts` need the kernel before the consent engine
 * loads. Deciding and inserting the plain ones a choice allows is core's
 * (`@inth/sdk/surface-actions/plain-scripts`).
 *
 * @internal
 */

import type { Script } from '@inth/sdk/modules/script-loader';

/**
 * Whether a script names a vendor, which declares it for vendor-level
 * consent: a choice then also decides that vendor, which only the kernel
 * records.
 *
 * @param script - A configured script.
 * @returns `true` when the script carries vendor fields.
 * @internal
 */
export const declaresVendor = function declaresVendor(script: Script): boolean {
	return (
		script.vendor !== undefined ||
		script.vendorId !== undefined ||
		script.vendorDetails !== undefined
	);
};
