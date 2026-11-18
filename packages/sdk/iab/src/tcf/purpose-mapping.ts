/**
 * IAB Purpose to Inth Consent Mapping
 *
 * Maps IAB TCF purposes (1-11) to inth's consent categories.
 *
 * @packageDocumentation
 */

import type { AllConsentNames } from '@inth/sdk-core';

/**
 * Maps IAB TCF purpose IDs to Inth consent categories.
 *
 * IAB TCF 2.4 defines 11 purposes:
 * - Purpose 1: Store and/or access information on a device -> `necessary`
 * - Purpose 2: Use limited data to select advertising -> `marketing`
 * - Purpose 3: Create profiles for personalised advertising -> `marketing`
 * - Purpose 4: Use profiles to select personalised advertising -> `marketing`
 * - Purpose 5: Create profiles to personalise content -> `experience`
 * - Purpose 6: Use profiles to select personalised content -> `experience`
 * - Purpose 7: Measure advertising performance -> `measurement`
 * - Purpose 8: Measure content performance -> `measurement`
 * - Purpose 9: Understand audiences through statistics -> `measurement`
 * - Purpose 10: Develop and improve services -> `functionality`
 * - Purpose 11: Use limited data to select content -> `functionality`
 *
 * @public
 */
export const IAB_PURPOSE_TO_INTH_MAP: Record<number, AllConsentNames> = {
	1: 'necessary',
	10: 'functionality',
	11: 'functionality',
	2: 'marketing',
	3: 'marketing',
	4: 'marketing',
	5: 'experience',
	6: 'experience',
	7: 'measurement',
	8: 'measurement',
	9: 'measurement',
};

/**
 * Maps Inth consent categories to IAB TCF purpose IDs.
 *
 * @public
 */
export const INTH_TO_IAB_PURPOSE_MAP: Record<AllConsentNames, number[]> = {
	experience: [5, 6],
	functionality: [10, 11],
	marketing: [2, 3, 4],
	measurement: [7, 8, 9],
	necessary: [1],
};

/**
 * Converts an IAB purpose ID to a Inth consent category.
 *
 * @param purposeId - IAB purpose ID (1-11)
 * @returns The corresponding Inth consent category, or null if invalid
 *
 * @example
 * ```typescript
 * iabPurposeToInth(1); // 'necessary'
 * iabPurposeToInth(2); // 'marketing'
 * iabPurposeToInth(7); // 'measurement'
 * iabPurposeToInth(99); // null
 * ```
 *
 * @public
 */
export const iabPurposeToInth = function iabPurposeToInth(
	purposeId: number
): AllConsentNames | null {
	return IAB_PURPOSE_TO_INTH_MAP[purposeId] ?? null;
};

/**
 * Converts a Inth consent category to IAB purpose IDs.
 *
 * @param category - Inth consent category
 * @returns Array of corresponding IAB purpose IDs
 *
 * @example
 * ```typescript
 * inthToIabPurposes('marketing'); // [2, 3, 4]
 * inthToIabPurposes('measurement'); // [7, 8, 9]
 * ```
 *
 * @public
 */
export const inthToIabPurposes = function inthToIabPurposes(
	category: AllConsentNames
): number[] {
	return INTH_TO_IAB_PURPOSE_MAP[category] ?? [];
};

/**
 * Converts Inth consent state to IAB purpose consents.
 *
 * @param consents - Inth consent state object
 * @returns IAB purpose consent state (keyed by purpose ID 1-11)
 *
 * @example
 * ```typescript
 * const inthConsents = {
 *   necessary: true,
 *   marketing: false,
 *   experience: true,
 *   measurement: true,
 *   functionality: false,
 * };
 *
 * const purposeConsents = inthConsentsToIabPurposes(inthConsents);
 * // {
 * //   1: true,  // necessary
 * //   2: false, 3: false, 4: false,  // marketing
 * //   5: true, 6: true,  // experience
 * //   7: true, 8: true, 9: true,  // measurement
 * //   10: false, 11: false,  // functionality
 * // }
 * ```
 *
 * @public
 */
export const inthConsentsToIabPurposes = function inthConsentsToIabPurposes(
	consents: Record<AllConsentNames, boolean>
): Record<number, boolean> {
	const purposeConsents: Record<number, boolean> = {};

	for (const [category, value] of Object.entries(consents)) {
		const purposes = INTH_TO_IAB_PURPOSE_MAP[category as AllConsentNames];
		if (purposes) {
			for (const purposeId of purposes) {
				purposeConsents[purposeId] = value;
			}
		}
	}

	return purposeConsents;
};

/**
 * Converts IAB purpose consents to Inth consent state.
 *
 * When multiple IAB purposes map to the same Inth category,
 * the category is considered consented only if ALL its purposes are consented.
 *
 * @param purposeConsents - IAB purpose consent state
 * @param consentPurposes - Purposes some vendor processes on consent once
 * publisher restrictions apply. When given, a category is decided by its
 * purposes in this set: the visitor has no consent to give for the others,
 * and their legitimate interest is enforced per vendor by the IAB gate. A
 * category with none of its purposes in the set falls back to all of them,
 * so legitimate interest alone never grants a category.
 * @returns Inth consent state object
 *
 * @example
 * ```typescript
 * const purposeConsents = {
 *   1: true,
 *   2: false, 3: true, 4: false,  // marketing needs all three
 *   5: true, 6: true,
 *   7: true, 8: true, 9: true,
 *   10: true, 11: true,
 * };
 *
 * const inthConsents = iabPurposesToInthConsents(purposeConsents);
 * // {
 * //   necessary: true,
 * //   marketing: false,  // not all marketing purposes consented
 * //   experience: true,
 * //   measurement: true,
 * //   functionality: true,
 * // }
 * ```
 *
 * @public
 */
export const iabPurposesToInthConsents = function iabPurposesToInthConsents(
	purposeConsents: Record<number, boolean>,
	consentPurposes?: ReadonlySet<number>
): Record<AllConsentNames, boolean> {
	const inthConsents: Record<AllConsentNames, boolean> = {
		experience: false,
		functionality: false,
		marketing: false,
		measurement: false,
		necessary: true,
	};

	for (const [category, purposes] of Object.entries(INTH_TO_IAB_PURPOSE_MAP)) {
		if (category === 'necessary') {
			continue;
		}
		// Category is consented if ALL its deciding purposes are consented
		const deciding = consentPurposes
			? purposes.filter((purposeId) => consentPurposes.has(purposeId))
			: [];
		const allConsented = (deciding.length ? deciding : purposes).every(
			(purposeId) => purposeConsents[purposeId] === true
		);
		inthConsents[category as AllConsentNames] = allConsented;
	}

	return inthConsents;
};

/**
 * Gets the IAB purpose IDs required by a vendor based on their GVL entry.
 *
 * @param vendorPurposes - Array of purpose IDs from vendor's GVL entry
 * @param vendorLegIntPurposes - Array of legitimate interest purpose IDs
 * @returns Object with purpose arrays categorized by legal basis
 *
 * @public
 */
export const categorizeVendorPurposes = function categorizeVendorPurposes(
	vendorPurposes: number[],
	vendorLegIntPurposes: number[] = []
): {
	consentRequired: number[];
	legitInterest: number[];
	all: number[];
} {
	return {
		all: [...new Set([...vendorPurposes, ...vendorLegIntPurposes])],
		consentRequired: vendorPurposes,
		legitInterest: vendorLegIntPurposes,
	};
};

/**
 * Checks if a vendor has consent for all their required purposes.
 *
 * @param vendorPurposes - Purpose IDs the vendor requires consent for
 * @param vendorLegIntPurposes - Purpose IDs claimed under legitimate interest
 * @param purposeConsents - Current purpose consent state
 * @param purposeLegitInterests - Current purpose legitimate interest state
 * @returns True if all required consents/interests are granted
 *
 * @public
 */
export const vendorHasRequiredConsents = function vendorHasRequiredConsents(
	vendorPurposes: number[],
	vendorLegIntPurposes: number[],
	purposeConsents: Record<number, boolean>,
	purposeLegitInterests: Record<number, boolean>
): boolean {
	// Check consent purposes
	const hasAllConsents = vendorPurposes.every(
		(purposeId) => purposeConsents[purposeId] === true
	);

	// Check legitimate interest purposes
	const hasAllLegitInterests = vendorLegIntPurposes.every(
		(purposeId) => purposeLegitInterests[purposeId] === true
	);

	return hasAllConsents && hasAllLegitInterests;
};
