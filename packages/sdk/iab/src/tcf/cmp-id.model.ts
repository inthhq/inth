/**
 * CMP identity validation.
 *
 * A TC String carries the CMP ID in a 12-bit core-string field, and the TCF
 * encoder rejects anything below 2. Catching a bad ID here keeps a
 * misconfiguration from surfacing as an unmounted CMP that answers
 * `__tcfapi` with an unusable ID and then fails at save time.
 *
 * @packageDocumentation
 */

/**
 * Lowest CMP ID IAB Europe issues. The TC String reserves 0 and 1.
 *
 * @internal
 */
export const MIN_CMP_ID = 2;

/**
 * Highest CMP ID that fits the 12-bit TC String field.
 *
 * @internal
 */
export const MAX_CMP_ID = 4_095;

/** @internal */
export const isValidCmpId = function isValidCmpId(
	value: unknown
): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= MIN_CMP_ID &&
		value <= MAX_CMP_ID
	);
};

/** @internal */
export const createCmpIdError = function createCmpIdError(
	value: unknown
): Error {
	const received =
		value === undefined ? 'undefined (no cmpId was provided)' : String(value);
	return new Error(
		`@inth/sdk/iab needs a CMP ID registered with IAB Europe: an integer from ${MIN_CMP_ID} to ${MAX_CMP_ID}. ` +
			`A TC String cannot be encoded without one, so no consent record is written. ` +
			`Register at https://register.consensu.org/CMP, or omit cmpId and let the backend ` +
			`return it from /init. Received: ${received}.`
	);
};

/** @internal */
export const assertValidCmpId = function assertValidCmpId(
	value: unknown
): number {
	if (!isValidCmpId(value)) {
		throw createCmpIdError(value);
	}
	return value;
};
