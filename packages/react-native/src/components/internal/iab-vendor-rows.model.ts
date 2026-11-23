/**
 * What the IAB rows derive from partners: how many distinct partners a set
 * of rows names, a partner row's test id, and the legal-basis legs a partner
 * claims under.
 */

import type {
	ConsentIabDisplayModel,
	ConsentIabProcessedVendor,
} from '../iab-display.model';

/**
 * How many distinct partners claim a set of rows.
 *
 * A stack's meta line counts partners, not claims, so a partner that appears
 * under three of the stack's purposes is still one name in the number, which is
 * how the web's `totalVendors` arrives at the same figure.
 *
 * @param rows - Rows whose partners are being counted.
 * @param rows.vendors - Partners claiming each row.
 * @returns Distinct partner ids.
 */
export const distinctVendorCount = function distinctVendorCount(
	rows: { vendors: ConsentIabProcessedVendor[] }[]
): number {
	const ids = new Set<string>();

	for (const row of rows) {
		for (const vendor of row.vendors) {
			ids.add(String(vendor.id));
		}
	}

	return ids.size;
};

/**
 * The `testID` for one partner row.
 *
 * The display model carries a `testId` for every purpose, stack, feature, and
 * special feature, and a row that has one always uses it. It does not carry one
 * for a partner: the web's vendors list puts no `data-testid` on a partner row at
 * all, so there is nothing to mirror, and this prefix is the surface's own.
 * It cannot collide with the model's five prefixes.
 *
 * @param id - Partner id, GVL or custom.
 * @returns A test id unique across the surface.
 */
export const consentIabVendorTestId = function consentIabVendorTestId(
	id: number | string
): string {
	return `vendor-item-${String(id)}`;
};

/**
 * One legal-basis leg of a partner's disclosure.
 *
 * @param model - Model in force, which is where the ids become names.
 * @param vendor - Partner being disclosed.
 * @returns The legs worth listing, in the web's order.
 */
export const vendorLegs = function vendorLegs(
	model: ConsentIabDisplayModel,
	vendor: ConsentIabProcessedVendor
): {
	readonly features: string[];
	readonly legitimateInterest: string[];
	readonly purposes: string[];
	readonly specialFeatures: string[];
	readonly specialPurposes: string[];
} {
	const names = (
		entries: { id: number; name: string }[],
		ids: number[]
	): string[] =>
		ids
			.map((id) => entries.find((entry) => entry.id === id)?.name)
			.filter((name): name is string => typeof name === 'string');

	return {
		features: names(model.data.features, vendor.features),
		legitimateInterest: names(model.data.purposes, vendor.legIntPurposes),
		purposes: names(model.data.purposes, vendor.purposes),
		specialFeatures: names(model.data.specialFeatures, vendor.specialFeatures),
		specialPurposes: names(model.data.specialPurposes, vendor.specialPurposes),
	};
};
