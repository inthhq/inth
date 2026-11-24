import { describe, expect, it } from 'vite-plus/test';

import { isSaveRequest } from './save-request';

describe('isSaveRequest', () => {
	it('matches each arm fixture save and not the other library', () => {
		const v2 = 'http://127.0.0.1:4100/mock-backend/subjects';
		const v3 =
			'http://127.0.0.1:4100/mock-backend/v1/consent/records?journey=x';
		expect(isSaveRequest('v2', 'POST', v2)).toBe(true);
		expect(isSaveRequest('v3', 'POST', v3)).toBe(true);
		expect(isSaveRequest('v2', 'POST', v3)).toBe(false);
		expect(isSaveRequest('v3', 'POST', v2)).toBe(false);
	});

	it('ignores reads of the same path', () => {
		expect(
			isSaveRequest('v3', 'GET', 'http://x/mock-backend/v1/consent/records')
		).toBe(false);
	});
});
