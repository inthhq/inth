import { afterEach, describe, expect, it, vi } from 'vitest';

import { isUuidV7 } from '../../transports/v1/routes';
import { createIdempotencyKey, generateUuidV7 } from '../subject-uuid';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('generateUuidV7', () => {
	it('makes a lowercase UUIDv7 with the RFC 4122 variant', () => {
		for (let index = 0; index < 200; index += 1) {
			expect(isUuidV7(generateUuidV7())).toBe(true);
		}
	});

	it('puts the Unix milliseconds in the first 48 bits', () => {
		vi.useFakeTimers({ now: 0x01_93_e5_a8_6f_00 });
		expect(generateUuidV7().startsWith('0193e5a8-6f00-7')).toBe(true);
	});

	it('orders IDs by time', () => {
		vi.useFakeTimers({ now: 1_700_000_000_000 });
		const earlier = generateUuidV7();
		vi.setSystemTime(1_700_000_000_001);
		expect(earlier < generateUuidV7()).toBe(true);
	});

	it('uses random bits for the rest', () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			(array as Uint8Array).fill(0xff);
			return array;
		});
		expect(generateUuidV7()).toBe('00000000-0000-7fff-bfff-ffffffffffff');
	});
});

describe('createIdempotencyKey', () => {
	it('makes a new UUID each time', () => {
		const first = createIdempotencyKey();
		expect(isUuidV7(first)).toBe(true);
		expect(first).not.toBe(createIdempotencyKey());
	});
});
