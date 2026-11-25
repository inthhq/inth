import { describe, expect, test } from 'vite-plus/test';

import { PARTS_SHEETS } from '../../src/lib/core/consent-styles';
import { WIDGET_SHEETS } from './widget-sheets';

describe('WIDGET_SHEETS', () => {
	test('starts with the shared parts sheets, in their order', () => {
		expect(WIDGET_SHEETS.slice(0, PARTS_SHEETS.length)).toEqual(PARTS_SHEETS);
	});
});
