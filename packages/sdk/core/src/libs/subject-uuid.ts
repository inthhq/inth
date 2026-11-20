/**
 * UUIDv7 identifiers for the `/v1` routes: subject IDs and idempotency keys.
 *
 * @packageDocumentation
 */

import { V1_UUID_V7_PATTERN } from '@inth/sdk-schema/types';

const toHex = (byte: number): string => byte.toString(16).padStart(2, '0');

/**
 * Makes a UUIDv7: 48 bits of Unix milliseconds, then 74 random bits.
 *
 * @returns A UUIDv7 in lowercase canonical text.
 * @example
 * ```ts
 * generateUuidV7(); // '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'
 * ```
 */
export const generateUuidV7 = function generateUuidV7(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const now = Date.now();
	const view = new DataView(bytes.buffer);
	view.setUint16(0, Math.floor(now / 2 ** 32), false);
	view.setUint32(2, now % 2 ** 32, false);
	bytes[6] = ((bytes[6] ?? 0) % 16) + 0x70;
	bytes[8] = ((bytes[8] ?? 0) % 64) + 0x80;
	const hex = Array.from(bytes, toHex).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Whether `id` has the layout of a `/v1` subject ID. The timestamp is not
 * judged.
 *
 * @param id - The string to check.
 * @returns `true` for a lowercase UUIDv7.
 */
export const isUuidV7 = function isUuidV7(id: string): boolean {
	return V1_UUID_V7_PATTERN.test(id);
};

/**
 * Makes the idempotency key of one user action. Make it once, keep it with
 * the action, and send the same key on every retry.
 *
 * @returns A UUIDv7.
 */
export const createIdempotencyKey = generateUuidV7;
