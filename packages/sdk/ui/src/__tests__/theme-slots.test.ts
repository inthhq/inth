import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import bannerStyles from '@inth/sdk-ui/styles/components/consent-banner';
import cardStyles from '@inth/sdk-ui/styles/components/consent-card';
import drawerStyles from '@inth/sdk-ui/styles/components/consent-drawer';
import { describe, expect, expectTypeOf, test } from 'vitest';

import type { ComponentSlots, Theme } from '../theme/types';

describe('theme keys for banner rights and dismiss', () => {
	test('slots expose the rights group and right link', () => {
		expectTypeOf<ComponentSlots>().toHaveProperty('consentBannerRights');
		expectTypeOf<ComponentSlots>().toHaveProperty('consentBannerRightLink');
	});

	test('consentActions accepts a dismiss treatment', () => {
		expectTypeOf<NonNullable<Theme['consentActions']>>().toHaveProperty(
			'dismiss'
		);
	});
});

describe('prompt container stylesheet', () => {
	const builtCss = readFileSync(
		join(import.meta.dirname, '../../dist/styles.css'),
		'utf-8'
	);

	test.each([
		['card', cardStyles.root],
		['banner', bannerStyles.root],
		['drawer', drawerStyles.root],
	])('styles.css carries the %s container', (_name, className) => {
		expect(className).toMatch(/^inth-ui-/u);
		expect(builtCss).toContain(`.${className}`);
	});
});
