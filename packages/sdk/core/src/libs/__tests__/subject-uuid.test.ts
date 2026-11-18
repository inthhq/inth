import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createIdempotencyKey,
	generateUuidV7,
	isLegacySubjectId,
	isUuidV7,
	subjectIdKind,
} from '../subject-uuid';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('generateUuidV7', () => {
	it('makes a lowercase UUIDv7 with the RFC 4122 variant', () => {
		for (let index = 0; index < 200; index += 1) {
			const id = generateUuidV7();
			expect(id).toMatch(
				/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u
			);
			expect(isUuidV7(id)).toBe(true);
		}
	});

	it('puts the Unix milliseconds in the first 48 bits', () => {
		const id = generateUuidV7(0x01_93_e5_a8_6f_00);
		expect(id.startsWith('0193e5a8-6f00-7')).toBe(true);
	});

	it('orders IDs by time', () => {
		const earlier = generateUuidV7(1_700_000_000_000);
		const later = generateUuidV7(1_700_000_000_001);
		expect(earlier < later).toBe(true);
	});

	it('clamps a clock outside the 48-bit range', () => {
		expect(isUuidV7(generateUuidV7(-5))).toBe(true);
		expect(generateUuidV7(-5).startsWith('00000000-0000-7')).toBe(true);
		expect(generateUuidV7(2 ** 60).startsWith('ffffffff-ffff-7')).toBe(true);
		expect(isUuidV7(generateUuidV7(Number.NaN))).toBe(true);
	});

	it('uses random bits for the rest', () => {
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			(array as Uint8Array).fill(0xff);
			return array;
		});
		expect(generateUuidV7(0)).toBe('00000000-0000-7fff-bfff-ffffffffffff');
	});
});

describe('subjectIdKind', () => {
	it.each([
		['0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c', 'uuid'],
		['sub_2VZxR7YmNpKq3WfLs8TgHd', 'legacy'],
		['0193E5A8-6F00-7C3A-8A1B-5D2E7F9A0B1C', 'invalid'],
		['0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c', 'invalid'],
		['0193e5a8-6f00-7c3a-ca1b-5d2e7f9a0b1c', 'invalid'],
		['00000000-0000-0000-0000-000000000000', 'invalid'],
		['ffffffff-ffff-ffff-ffff-ffffffffffff', 'invalid'],
		['sub_0OIl', 'invalid'],
		['', 'invalid'],
	])('reads %s as %s', (id, kind) => {
		expect(subjectIdKind(id)).toBe(kind);
	});

	it('names the sub_ form as legacy only', () => {
		expect(isLegacySubjectId('sub_2VZxR7YmNpKq3WfLs8TgHd')).toBe(true);
		expect(isLegacySubjectId(generateUuidV7())).toBe(false);
	});
});

describe('createIdempotencyKey', () => {
	it('makes a new UUID each time', () => {
		const first = createIdempotencyKey();
		const second = createIdempotencyKey();
		expect(isUuidV7(first)).toBe(true);
		expect(first).not.toBe(second);
	});
});
