import { describe, expect, it } from 'vite-plus/test';

import { isValidSubjectId } from '../native-wire';

describe('isValidSubjectId', () => {
	it('accepts a sub_ id in base58 and nothing else', () => {
		expect(isValidSubjectId('sub_2VZxR7YmNpKq3WfLs8TgHd')).toBe(true);
		expect(isValidSubjectId('sub_')).toBe(false);
		expect(isValidSubjectId('cns_2VZxR7YmNpKq3WfLs8TgHd')).toBe(false);
		expect(isValidSubjectId('sub_0OIl')).toBe(false);
		expect(isValidSubjectId('019c1c38-a400-7fbc-9cf3-23928bf7d9d5')).toBe(
			false
		);
	});
});
