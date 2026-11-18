/**
 * UUIDv7 identifiers for the `/v1` routes: subject IDs and idempotency keys.
 *
 * A `/v1` subject ID is a UUIDv7 in lowercase canonical text, made on the
 * device. The backend checks only its layout (36 characters, version 7,
 * RFC 4122 variant), never its timestamp, so a device with a wrong clock
 * still makes an ID the backend accepts.
 *
 * A browser that ran an earlier client may hold a `sub_` ID instead. `/v1`
 * routes accept it and answer with the canonical UUID, which replaces it.
 * {@link subjectIdKind} tells the two apart.
 *
 * @packageDocumentation
 */

import { isValidSubjectId } from './generate-subject-id';

/** Lowercase canonical UUIDv7 with the RFC 4122 variant. */
const UUID_V7_PATTERN =
	/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

/** Largest value a 48-bit timestamp holds. */
const MAX_TIMESTAMP = 2 ** 48 - 1;

const toHex = (byte: number): string => byte.toString(16).padStart(2, '0');

/**
 * Makes a UUIDv7: 48 bits of Unix milliseconds, then 74 random bits.
 *
 * @param now - Unix milliseconds for the timestamp field. Defaults to
 * `Date.now()`. A value outside the 48-bit range is clamped into it.
 * @returns A UUIDv7 in lowercase canonical text.
 * @example
 * ```ts
 * generateUuidV7(); // '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'
 * ```
 */
export const generateUuidV7 = function generateUuidV7(
	now: number = Date.now()
): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const timestamp = Math.min(
		Math.max(Math.trunc(Number.isFinite(now) ? now : 0), 0),
		MAX_TIMESTAMP
	);
	const view = new DataView(bytes.buffer);
	view.setUint16(0, Math.floor(timestamp / 2 ** 32), false);
	view.setUint32(2, timestamp % 2 ** 32, false);
	// Version 7 in the high nibble of byte 6, the RFC 4122 variant in the
	// top two bits of byte 8.
	bytes[6] = ((bytes[6] ?? 0) % 16) + 0x70;
	bytes[8] = ((bytes[8] ?? 0) % 64) + 0x80;
	const hex = Array.from(bytes, toHex).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Whether `id` has the layout of a `/v1` subject ID: lowercase canonical
 * text, version 7, RFC 4122 variant. The version rules out the nil and max
 * UUIDs. The timestamp is not judged.
 *
 * @param id - The string to check.
 * @returns `true` for a lowercase UUIDv7.
 */
export const isUuidV7 = function isUuidV7(id: string): boolean {
	return UUID_V7_PATTERN.test(id);
};

/**
 * What kind of subject ID a stored value is.
 *
 * - `uuid`: a canonical `/v1` subject ID.
 * - `legacy`: the `sub_` ID an earlier client stored. `/v1` routes accept
 *   it and answer with the canonical UUID.
 * - `invalid`: neither. Do not send it.
 */
export type SubjectIdKind = 'uuid' | 'legacy' | 'invalid';

/**
 * Tells a canonical UUIDv7 subject ID from a `sub_` ID an earlier client
 * stored.
 *
 * @param id - The stored subject ID.
 * @returns Its kind.
 * @example
 * ```ts
 * subjectIdKind('0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'); // 'uuid'
 * subjectIdKind('sub_2VZxR7YmNpKq3WfLs8TgHd'); // 'legacy'
 * ```
 */
export const subjectIdKind = function subjectIdKind(id: string): SubjectIdKind {
	if (isUuidV7(id)) {
		return 'uuid';
	}
	return isValidSubjectId(id) ? 'legacy' : 'invalid';
};

/**
 * Whether `id` is the `sub_` form an earlier client stored, which the
 * backend replaces with a canonical UUID.
 *
 * @param id - The stored subject ID.
 * @returns `true` for a `sub_` ID.
 */
export const isLegacySubjectId = function isLegacySubjectId(
	id: string
): boolean {
	return subjectIdKind(id) === 'legacy';
};

/**
 * Makes the idempotency key of one user action. Make it once, keep it with
 * the action, and send the same key on every retry.
 *
 * @returns A UUIDv7.
 */
export const createIdempotencyKey = function createIdempotencyKey(): string {
	return generateUuidV7();
};
