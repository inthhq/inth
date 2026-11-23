import * as v from 'valibot';

/**
 * Schema for a custom vendor not registered with IAB.
 *
 * These vendors process data based on user consent but are not part of the
 * IAB Transparency & Consent Framework. They must manually declare all their
 * data practices to maintain the same level of transparency as IAB vendors.
 */
export const nonIABVendorSchema = v.object({
	/** Maximum cookie/storage duration in seconds */
	cookieMaxAgeSeconds: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1))
	),

	/**
	 * Data categories collected/used (IAB data category IDs 1-11).
	 */
	dataCategories: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(11)))
	),

	/** How long data is retained (in days) */
	dataRetentionDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),

	/** Description of what this vendor does */
	description: v.optional(v.string()),

	/**
	 * Features this vendor uses (IAB feature IDs 1-3).
	 */
	features: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)))
	),
	/**
	 * Unique identifier for the vendor.
	 * Use a slug-like string (e.g., 'internal-analytics', 'live-chat') or a
	 * numeric ID if you already have one.
	 */
	id: v.union([v.string(), v.pipe(v.number(), v.integer())]),

	/**
	 * IAB purposes this vendor claims legitimate interest for.
	 * Users can object to these purposes.
	 *
	 * TCF allows purposes 1, 3, 4, 5 and 6 only with consent, so the CMP
	 * ignores them here: it neither signals legitimate interest for them nor
	 * offers an objection. List those purposes in `purposes` instead.
	 */
	legIntPurposes: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(11)))
	),

	/** Display name shown to users */
	name: v.string(),

	/** Privacy policy URL (required for transparency) */
	privacyPolicyUrl: v.pipe(v.string(), v.url()),

	/**
	 * IAB purposes this vendor requires consent for.
	 * Uses standard IAB purpose IDs (1-11) for consistency.
	 */
	purposes: v.array(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(11))
	),

	/**
	 * Special features requiring explicit opt-in (IAB special feature IDs 1-2).
	 */
	specialFeatures: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2)))
	),

	usesCookies: v.optional(v.boolean()),

	/** Whether this vendor uses non-cookie storage (localStorage, IndexedDB, etc.) */
	usesNonCookieAccess: v.optional(v.boolean()),
});

export const nonIABVendorConsentSchema = v.object({
	consented: v.boolean(),

	/** Timestamp when consent was given/modified */
	timestamp: v.number(),

	vendorId: v.union([v.string(), v.pipe(v.number(), v.integer())]),
});

export type NonIABVendor = v.InferOutput<typeof nonIABVendorSchema>;
export type NonIABVendorConsent = v.InferOutput<
	typeof nonIABVendorConsentSchema
>;
