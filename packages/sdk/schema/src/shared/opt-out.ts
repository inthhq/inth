/**
 * Durable opt-out record types and location-to-rights lookup.
 *
 * US state privacy laws grant different combinations of sale, sharing and
 * targeted-advertising opt-out rights. This module maps a visitor's location
 * to the rights an opt-out there refuses, in canonical order.
 *
 * @packageDocumentation
 */

/** Opt-out rights in canonical order. */
export const OPT_OUT_RIGHTS = ['sale', 'share', 'targeted_ads'] as const;

/** A single opt-out right a record can refuse. */
export type OptOutRight = (typeof OPT_OUT_RIGHTS)[number];

/** How an opt-out record was created. */
export const OPT_OUT_METHODS = ['button', 'gpc', 'api', 'propagated'] as const;

/** One of {@link OPT_OUT_METHODS}. */
export type OptOutMethod = (typeof OPT_OUT_METHODS)[number];

/** Who holds an opt-out record. */
export const OPT_OUT_HOLDERS = ['device', 'person', 'both'] as const;

/** One of {@link OPT_OUT_HOLDERS}. */
export type OptOutHolder = (typeof OPT_OUT_HOLDERS)[number];

/**
 * Durable opt-out record, separate from per-category consent choices.
 *
 * Records created in the browser carry `heldBy: 'device'` and `method` of
 * `'button'` or `'gpc'`. Account-level and backend-originated values
 * (`'api'`, `'propagated'`, `'person'`, `'both'`) share the same shape.
 */
export interface OptOutRecord {
	/** At least one right, no duplicates, in canonical order: `sale`, `share`, `targeted_ads`. */
	rights: OptOutRight[];
	/** How the opt-out was recorded. */
	method: OptOutMethod;
	/** Epoch milliseconds when the opt-out was recorded. */
	recordedAt: number;
	/** Whether the device, the person's account, or both hold this opt-out. */
	heldBy: OptOutHolder;
}

/** Location inputs accepted by {@link resolveOptOutRights}. */
export interface OptOutLocation {
	country?: string | null;
	region?: string | null;
}

const US_SALE_AND_TARGETED_ADS_STATES: ReadonlySet<string> = new Set([
	'CO',
	'CT',
	'DE',
	'FL',
	'IA',
	'IN',
	'KY',
	'MD',
	'MN',
	'MT',
	'NE',
	'NH',
	'NJ',
	'OR',
	'RI',
	'TN',
	'TX',
	'UT',
	'VA',
]);

const normalizeCountry = function normalizeCountry(
	country: string | null | undefined
): string | null {
	const value = country?.trim().toUpperCase();
	return value || null;
};

const normalizeRegion = function normalizeRegion(
	country: string | null,
	region: string | null | undefined
): string | null {
	const value = region?.trim().toUpperCase();
	if (!value) {
		return null;
	}
	if (country && value.startsWith(`${country}-`)) {
		return value.slice(country.length + 1) || null;
	}
	return value;
};

/**
 * Rights refused by an opt-out at `location`, in canonical order.
 *
 * Region codes may arrive bare (`CA`) or prefixed (`US-CA`), in any case.
 * Unknown or unmapped locations receive the broadest set so an opt-out never
 * under-records the visitor's refusal.
 */
export const resolveOptOutRights = function resolveOptOutRights(
	location?: OptOutLocation | null
): OptOutRight[] {
	const country = normalizeCountry(location?.country);
	const region = normalizeRegion(country, location?.region);
	if (country === 'US' && region !== null) {
		if (region === 'CA') {
			return ['sale', 'share'];
		}
		if (region === 'NV') {
			return ['sale'];
		}
		if (US_SALE_AND_TARGETED_ADS_STATES.has(region)) {
			return ['sale', 'targeted_ads'];
		}
	}
	return ['sale', 'share', 'targeted_ads'];
};
