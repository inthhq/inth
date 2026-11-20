import { describe, expect, test } from 'vitest';

import { CPPA_OPT_OUT_ICON, cppaOptOutIconSvg } from '../opt-out-icon';

describe('CPPA opt-out icon', () => {
	test('preserves the official viewBox, paths, and fixed colors', () => {
		expect(CPPA_OPT_OUT_ICON.viewBox).toBe('0 0 30 14');
		expect(CPPA_OPT_OUT_ICON.paths).toHaveLength(4);
		expect(CPPA_OPT_OUT_ICON.paths.map((path) => path.fill)).toEqual([
			'#FFFFFF',
			'#0066FF',
			'#FFFFFF',
			'#0066FF',
		]);
		expect(
			CPPA_OPT_OUT_ICON.paths.map((path) => Boolean(path.evenOdd))
		).toEqual([true, true, false, false]);
	});

	test('renders decorative aria-hidden SVG markup without ids or titles', () => {
		const markup = cppaOptOutIconSvg('icon-class');
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).toContain('focusable="false"');
		expect(markup).toContain('class="icon-class"');
		expect(markup).toContain('viewBox="0 0 30 14"');
		expect(markup).toContain('fill="#0066FF"');
		expect(markup).toContain('fill="#FFFFFF"');
		expect(markup).not.toContain('<title');
		expect(markup).not.toContain(' id=');
	});
});
