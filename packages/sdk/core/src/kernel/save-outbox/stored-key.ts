/* oxlint-disable no-bitwise -- cyrb128 and the UUID bits work on 32-bit lanes. */

import type { SavePayload } from '../../types';

/** A save payload as read from storage: an older client may have stored no key. */
export type StoredSavePayload = Omit<SavePayload, 'idempotencyKey'> & {
	idempotencyKey?: string;
};

/**
 * `V1_UUID_PATTERN` from `@inth/sdk-schema/types`, copied: this module loads
 * with the stored queue alone, so it imports no values
 * (`save-outbox-chunk.test.ts`).
 */
const LOWERCASE_UUID =
	/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

const toHex = (lane: number): string =>
	(lane >>> 0).toString(16).padStart(8, '0');

/** Four 32-bit lanes hashed from `text` (cyrb128 mixing). */
const hashLanes = function hashLanes(
	text: string
): [number, number, number, number] {
	let h1 = 0x6a_09_e6_67;
	let h2 = 0xbb_67_ae_85;
	let h3 = 0x3c_6e_f3_72;
	let h4 = 0xa5_4f_f5_3a;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		h1 = h2 ^ Math.imul(h1 ^ code, 597_399_067);
		h2 = h3 ^ Math.imul(h2 ^ code, 2_869_860_233);
		h3 = h4 ^ Math.imul(h3 ^ code, 951_274_213);
		h4 = h1 ^ Math.imul(h4 ^ code, 2_716_044_179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597_399_067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2_869_860_233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951_274_213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2_716_044_179);
	h1 ^= h2 ^ h3 ^ h4;
	return [h1, h2 ^ h1, h3 ^ h1, h4 ^ h1];
};

/**
 * `payload` with an idempotency key. A c15t client, or a release before
 * keys, stored saves without one; a key that is not a lowercase UUID is
 * replaced the same way.
 *
 * The key is a UUIDv8 hashed from the stored payload, which holds the
 * subject ID, and the time it was queued, not a random one: a browser whose
 * storage refuses the write-back reads the entry without a key every time,
 * and every read must give the same key. Changing what is hashed changes
 * that key in every such browser. The hash is fast, not cryptographic;
 * nobody gains from forging a key.
 *
 * @param payload - A stored payload, without its identity token.
 * @param queuedAt - When the entry was queued.
 * @returns The payload to replay and store.
 * @internal
 */
export const withStoredIdempotencyKey = function withStoredIdempotencyKey(
	payload: StoredSavePayload,
	queuedAt: number
): SavePayload {
	const { idempotencyKey: stored } = payload;
	if (stored !== undefined && LOWERCASE_UUID.test(stored)) {
		return { ...payload, idempotencyKey: stored };
	}
	// A key that is not a lowercase UUID was never accepted by the backend,
	// so the save gets the key it would have had with none.
	const { idempotencyKey: _malformed, ...keyless } = payload;
	const [h1, h2, h3, h4] = hashLanes(`${queuedAt}\n${JSON.stringify(keyless)}`);
	const hex = [
		h1,
		(h2 & 0xff_ff_0f_ff) | 0x80_00,
		(h3 & 0x3f_ff_ff_ff) | 0x80_00_00_00,
		h4,
	]
		.map(toHex)
		.join('');
	const idempotencyKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	return { ...payload, idempotencyKey };
};
