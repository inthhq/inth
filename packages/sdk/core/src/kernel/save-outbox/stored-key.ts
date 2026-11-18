/**
 * The idempotency key of a stored save that has none. A c15t client, or a
 * release before keys, queued it.
 *
 * The key is derived from the stored entry instead of drawn at random, so
 * every read of the same entry gives the same key, also when storage refuses
 * the write that would keep it. Once the queue writes the entry back, the
 * stored key is used as it is.
 *
 * @internal
 */
/* oxlint-disable no-bitwise -- A 128-bit string hash works on 32-bit lanes. */

import type { SavePayload } from '../../types';

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
 * `payload` with an idempotency key: its own, or a UUIDv8 (the RFC 9562
 * layout for derived IDs) hashed from the payload and the time it was
 * queued. The payload holds the subject ID, so two visitors' saves do not
 * share a key.
 *
 * Returns the same object when the payload has a key.
 *
 * @param payload - A stored payload, without its identity token.
 * @param queuedAt - When the entry was queued.
 * @returns The payload to replay and store.
 */
export const withStoredIdempotencyKey = function withStoredIdempotencyKey(
	payload: SavePayload,
	queuedAt: number
): SavePayload {
	if (payload.idempotencyKey !== undefined) {
		return payload;
	}
	const hex = hashLanes(`${queuedAt}\n${JSON.stringify(payload)}`)
		.map(toHex)
		.join('');
	const variant = ((Number.parseInt(hex[16] ?? '0', 16) % 4) + 8).toString(16);
	const idempotencyKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
	return { ...payload, idempotencyKey };
};
