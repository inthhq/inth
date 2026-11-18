import { afterEach, describe, expect, test, vi } from 'vitest';

import { buildColorSchemeScript } from '../../utils/color-scheme';
import { resolveActionAppearance } from '../action-appearance';
import {
	THEME_STYLE_ELEMENT_ID,
	warnOnUnappliedThemeTokens,
} from '../token-warning';

describe('resolveActionAppearance', () => {
	test('falls back to stroke, primary or neutral', () => {
		expect(resolveActionAppearance(undefined, 'accept', true)).toEqual({
			mode: 'stroke',
			variant: 'primary',
		});
		expect(resolveActionAppearance({}, 'reject', false)).toEqual({
			mode: 'stroke',
			variant: 'neutral',
		});
	});

	test('layers the action, then primary, then default', () => {
		const theme = {
			consentActions: {
				accept: { variant: 'neutral' as const },
				default: { mode: 'ghost' as const, variant: 'neutral' as const },
				primary: { mode: 'filled' as const, variant: 'primary' as const },
			},
		};
		expect(resolveActionAppearance(theme, 'accept', true)).toEqual({
			mode: 'filled',
			variant: 'neutral',
		});
		expect(resolveActionAppearance(theme, 'reject', true)).toEqual({
			mode: 'filled',
			variant: 'primary',
		});
		expect(resolveActionAppearance(theme, 'reject', false)).toEqual({
			mode: 'ghost',
			variant: 'neutral',
		});
	});

	test('save has no key of its own', () => {
		const theme = {
			consentActions: { primary: { mode: 'filled' as const } },
		};
		expect(resolveActionAppearance(theme, 'save', true)).toEqual({
			mode: 'filled',
			variant: 'primary',
		});
	});
});

describe('warnOnUnappliedThemeTokens', () => {
	afterEach(() => {
		document.getElementById(THEME_STYLE_ELEMENT_ID)?.remove();
		vi.restoreAllMocks();
	});

	test('warns about tokens with no theme style element', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		warnOnUnappliedThemeTokens(
			{ colors: { primary: 'red' } },
			document,
			'Use a stylesheet.'
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/consentActions only\. Use a stylesheet\.$/u)
		);
	});

	test('stays quiet for slots only, an undefined token, or an applied theme', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		warnOnUnappliedThemeTokens({ slots: {} }, document, '');
		warnOnUnappliedThemeTokens({ colors: undefined }, document, '');
		const style = document.createElement('style');
		style.id = THEME_STYLE_ELEMENT_ID;
		document.head.append(style);
		warnOnUnappliedThemeTokens({ colors: {} }, document, '');
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('buildColorSchemeScript', () => {
	test('only dark and system need a script', () => {
		expect(buildColorSchemeScript('light')).toBe('');
		expect(buildColorSchemeScript('none')).toBe('');
		expect(buildColorSchemeScript(null)).toBe('');
		expect(buildColorSchemeScript(undefined)).toBe('');
		expect(buildColorSchemeScript('dark')).toContain("add('inth-dark')");
		expect(buildColorSchemeScript('system')).toMatch(/^try\{.*\}catch/su);
	});
});
