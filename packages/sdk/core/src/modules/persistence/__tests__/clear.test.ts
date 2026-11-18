/**
 * @vitest-environment jsdom
 */
import { expect, test } from 'vitest';

import { clearStoredConsentRecords } from './record-writes';

test('clearing removes the IAB addon records, the AC string included', () => {
	for (const key of ['euconsent-v2', 'addtl_consent']) {
		localStorage.setItem(key, 'value');
		document.cookie = `${key}=value; Path=/`;
	}
	localStorage.setItem('inth-iab-authority-v1', 'receipt');

	clearStoredConsentRecords();

	for (const key of [
		'euconsent-v2',
		'addtl_consent',
		'inth-iab-authority-v1',
	]) {
		expect(localStorage.getItem(key)).toBeNull();
	}
	expect(document.cookie).not.toContain('euconsent-v2=');
	expect(document.cookie).not.toContain('addtl_consent=');
});
