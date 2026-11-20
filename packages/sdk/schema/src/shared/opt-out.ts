/**
 * Durable opt-out record types and constants.
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
	/**
	 * Refused rights in canonical order (`sale`, `share`, `targeted_ads`),
	 * without duplicates. Empty on a local record until the backend answers
	 * with the rights for the visitor's location.
	 */
	rights: OptOutRight[];
	/** How the opt-out was recorded. */
	method: OptOutMethod;
	/** Epoch milliseconds when the opt-out was recorded. */
	recordedAt: number;
	/** Whether the device, the person's account, or both hold this opt-out. */
	heldBy: OptOutHolder;
}
