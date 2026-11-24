import { describe, expect, test } from 'vite-plus/test';

import { BANNER_SHEETS } from '../../src/lib/core/consent-styles';
import { DIALOG_SHEETS } from './dialog-sheets';

describe('DIALOG_SHEETS', () => {
	test('starts with the banner sheets, in their order', () => {
		expect(DIALOG_SHEETS.slice(0, BANNER_SHEETS.length)).toEqual(BANNER_SHEETS);
	});
});
