'use client';

import type { AllConsentNames, ResolvedVendor } from '@inth/sdk/engine';
import { vendorsListedUnder } from '@inth/sdk/engine';
import { useMemo } from 'react';

import { useVendorChoice } from '~/hooks';
import { useKernelSelector } from '~/use-kernel-selector';

/**
 * The vendors the stock preference center lists under one category, for a
 * custom preference center that shows the same rows.
 *
 * @remarks
 * A vendor known only from a script's `vendor` slug gets no row until the
 * site declares a vendor in `vendors` or on the backend, unless the visitor
 * turned it off. Then it stays listed so the visitor can turn it on again.
 * Under an `iab` policy the list is empty.
 *
 * @returns The vendors to list, in declared order.
 *
 * @example
 * ```tsx
 * function CategoryVendors({ category }: { category: AllConsentNames }) {
 *   const vendors = useVendorsListedUnder(category);
 *   return (
 *     <ul>
 *       {vendors.map((vendor) => (
 *         <li key={vendor.id}>{vendor.name ?? vendor.id}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 * @public
 */
export const useVendorsListedUnder = function useVendorsListedUnder(
	category: AllConsentNames
): ResolvedVendor[] {
	const model = useKernelSelector((snapshot) => snapshot.model);
	const vendors = useKernelSelector((snapshot) => snapshot.vendors);
	const vendorChoice = useVendorChoice();
	return useMemo(
		() => vendorsListedUnder({ model, vendorChoice, vendors }, category),
		[model, vendors, vendorChoice, category]
	);
};
