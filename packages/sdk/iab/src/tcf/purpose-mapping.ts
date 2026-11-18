/**
 * Maps IAB TCF purposes (1-11) to Inth's consent categories.
 *
 * @packageDocumentation
 */

import type { AllConsentNames } from '@inth/sdk-core';

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
 * Converts Inth consent state to IAB purpose consents, keyed by purpose ID.
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
 * @param consentPurposes - Purposes some vendor processes on consent once
 * publisher restrictions apply. When given, a category is decided by its
 * purposes in this set: the visitor has no consent to give for the others,
 * and their legitimate interest is enforced per vendor by the IAB gate. A
 * category with none of its purposes in the set falls back to all of them,
 * so legitimate interest alone never grants a category.
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
