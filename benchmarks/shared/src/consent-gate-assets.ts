/* oxlint-disable no-bitwise, operator-assignment -- CRC-32 and the seeded PRNG are bit arithmetic by definition. */
import { deflateSync } from 'node:zlib';

import { GATE_STATE_GLOBAL } from './consent-gate-page';

/**
 * Bytes CookieBench's courtyard hero weighs (`article-workload-v1`). At the
 * mobile profile's 200 KB/s it decides when LCP lands, so the bytes a consent
 * library loads before it move LCP by about 5 ms per KB.
 */
export const COOKIEBENCH_HERO_BYTES = 493_556;

const HERO_WIDTH = 1200;
const HERO_HEIGHT = 640;

const crcTable = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit += 1) {
		value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
});

const crc32 = function crc32(bytes: Uint8Array): number {
	let value = 0xff_ff_ff_ff;
	for (const byte of bytes) {
		value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
	}
	return (value ^ 0xff_ff_ff_ff) >>> 0;
};

const chunk = function chunk(type: string, data: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
	return Buffer.concat([head, data, crc]);
};

/**
 * A deterministic 1200x640 RGB PNG of about CookieBench's hero weight: a warm
 * gradient with seeded grain, which deflate cannot shrink much. Generated at
 * run time so the repository carries no binary, and identical on every run
 * and revision.
 *
 * @returns PNG bytes, within a few percent of {@link COOKIEBENCH_HERO_BYTES}.
 */
export const createGateHeroPng = function createGateHeroPng(): Buffer {
	let seed = 20_260_927;
	const random = () => {
		// mulberry32
		seed = (seed + 0x6d_2b_79_f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
	const stride = HERO_WIDTH * 3 + 1;
	const raw = Buffer.alloc(stride * HERO_HEIGHT);
	for (let y = 0; y < HERO_HEIGHT; y += 1) {
		const row = y * stride;
		raw[row] = 0;
		for (let x = 0; x < HERO_WIDTH; x += 1) {
			const offset = row + 1 + x * 3;
			const grain = y % 4 === 0 ? 0 : Math.floor(random() * 3);
			raw[offset] = 150 + Math.floor((x / HERO_WIDTH) * 80) + grain;
			raw[offset + 1] = 110 + Math.floor((y / HERO_HEIGHT) * 60) + grain;
			raw[offset + 2] = 80 + Math.floor(((x + y) / 1840) * 40) + grain;
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(HERO_WIDTH, 0);
	header.writeUInt32BE(HERO_HEIGHT, 4);
	header[8] = 8;
	header[9] = 2;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
};

/**
 * Body of one gated script. Like CookieBench's `/controlled/script`, it only
 * records that it executed, so `scriptsCompleteMs` measures when c15t let the
 * script run, not what the script does.
 *
 * @param id - Script id from `gateScripts()`.
 * @param category - The consent category that gates it.
 */
export const gateScriptBody = function gateScriptBody(
	id: string,
	category: string
): string {
	const global = JSON.stringify(GATE_STATE_GLOBAL);
	return `(() => {
	const bridge = (window[${global}] ??= { allowedCategories: [], consent: 'unset', scripts: [] });
	bridge.scripts.push({ id: ${JSON.stringify(id)}, category: ${JSON.stringify(category)}, at: performance.now() });
})();
`;
};
