import { describe, expect, it } from 'vite-plus/test';

import { booleanDataAttribute, listDataAttribute } from './attributes';

describe('vendor attribute helpers', () => {
	describe('booleanDataAttribute', () => {
		it('omits undefined values', () => {
			expect(booleanDataAttribute(undefined)).toBeUndefined();
		});

		it('serializes booleans as data attribute strings', () => {
			expect(booleanDataAttribute(true)).toBe('true');
			expect(booleanDataAttribute(false)).toBe('false');
		});

		it("omits the vendor's default and keeps the other value", () => {
			expect(booleanDataAttribute(true, true)).toBeUndefined();
			expect(booleanDataAttribute(false, true)).toBe('false');
			expect(booleanDataAttribute(false, false)).toBeUndefined();
			expect(booleanDataAttribute(true, false)).toBe('true');
		});
	});

	describe('listDataAttribute', () => {
		it('omits undefined values', () => {
			expect(listDataAttribute(undefined)).toBeUndefined();
		});

		it('passes through strings', () => {
			expect(listDataAttribute('example.com')).toBe('example.com');
		});

		it('joins arrays with commas', () => {
			expect(listDataAttribute(['example.com', ' www.example.com '])).toBe(
				'example.com,www.example.com'
			);
		});

		it('omits empty arrays and blank values', () => {
			expect(listDataAttribute([])).toBeUndefined();
			expect(listDataAttribute(['', '  '])).toBeUndefined();
			expect(listDataAttribute('  ')).toBeUndefined();
		});
	});
});
