import { describe, expect, test } from 'vite-plus/test';

import {
	BRAND_MARKS,
	brandMarkSvg,
	resolveBrandingTag,
	resolveBrandMark,
} from '../branding';

const styles = {
	branding: 'branding',
	brandingC15T: 'c15t',
	brandingC15TMark: 'c15tMark',
	brandingContent: 'content',
	brandingCopy: 'copy',
	brandingInth: 'inth',
	brandingTag: 'tag',
	brandingTagBanner: 'tagBanner',
	brandingTagDialog: 'tagDialog',
	brandingText: 'text',
	brandingWordmark: 'wordmark',
	brandingWordmarkLabel: 'label',
};

describe('resolveBrandMark', () => {
	test('shows the c15t mark only for c15t branding', () => {
		expect(resolveBrandMark('c15t')).toBe('c15t');
		expect(resolveBrandMark('inth')).toBe('inth');
		expect(resolveBrandMark('consent')).toBe('inth');
		expect(resolveBrandMark(null)).toBe('inth');
		expect(resolveBrandMark(undefined)).toBe('inth');
	});
});

describe('resolveBrandingTag', () => {
	test('hides the tag when the backend sends none', () => {
		expect(
			resolveBrandingTag({ branding: 'none', styles, surface: 'banner' })
		).toBeNull();
	});

	test('links inth branding, and missing branding, to inth.com', () => {
		for (const branding of ['inth', 'consent', null, undefined] as const) {
			const tag = resolveBrandingTag({
				branding,
				hostname: 'example.com',
				styles,
				surface: 'banner',
			});
			expect(tag?.brand).toBe('inth');
			expect(tag?.href).toBe('https://inth.com?ref=example.com');
		}
	});

	test('links c15t branding to c15t.com', () => {
		const tag = resolveBrandingTag({
			branding: 'c15t',
			styles,
			surface: 'dialog',
		});
		expect(tag).toMatchObject({
			brand: 'c15t',
			href: 'https://c15t.com',
		});
		expect(tag?.classes.wordmark).toBe('wordmark c15t');
	});

	test('names the variant, slot and test id after the surface', () => {
		const names = (
			['banner', 'dialog', 'widget', 'iab-banner', 'iab-dialog'] as const
		).map((surface) => {
			const tag = resolveBrandingTag({ branding: 'inth', styles, surface });
			return [
				tag?.variant,
				tag?.slot,
				tag?.componentKey,
				tag?.testId,
				tag?.classes.root,
			];
		});
		expect(names).toEqual([
			[
				'banner-tag',
				'consentBannerTag',
				'banner',
				'consent-banner-branding',
				'branding tag tagBanner',
			],
			[
				'dialog-tag',
				'consentDialogTag',
				'dialog',
				'consent-dialog-branding',
				'branding tag tagDialog',
			],
			[
				'dialog-tag',
				'consentWidgetTag',
				'manager',
				'consent-widget-branding',
				'branding tag tagDialog',
			],
			[
				'banner-tag',
				'iabConsentBannerTag',
				'iab-banner',
				'iab-consent-banner-branding',
				'branding tag tagBanner',
			],
			[
				'dialog-tag',
				'iabConsentDialogTag',
				'iab-dialog',
				'iab-consent-dialog-branding',
				'branding tag tagDialog',
			],
		]);
	});

	test('drops every stock class under noStyle', () => {
		const tag = resolveBrandingTag({
			branding: 'c15t',
			noStyle: true,
			styles,
			surface: 'banner',
		});
		expect(Object.values(tag?.classes ?? {})).toEqual(
			Array.from({ length: 7 }, () => '')
		);
	});
});

describe('brandMarkSvg', () => {
	test('draws every path with no id to repeat', () => {
		for (const mark of ['inth', 'c15t'] as const) {
			const markup = brandMarkSvg(mark);
			expect(markup).not.toContain('id=');
			expect(markup).toContain('aria-hidden="true"');
			expect(markup.match(/<path /gu)).toHaveLength(
				BRAND_MARKS[mark].paths.length
			);
		}
	});
});
