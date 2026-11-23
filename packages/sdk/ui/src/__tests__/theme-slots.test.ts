import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import bannerStyles from '@inth/sdk-ui/styles/components/consent-banner';
import cardStyles from '@inth/sdk-ui/styles/components/consent-card';
import drawerStyles from '@inth/sdk-ui/styles/components/consent-drawer';
import { describe, expect, expectTypeOf, test } from 'vitest';

import type { ComponentSlots, Theme } from '../theme/types';
import { THEME_SLOT_COMPONENT_KEYS } from '../utils/theme-slots';

describe('theme keys for banner rights and dismiss', () => {
	test('slots expose the right link and rights row, and no rights group', () => {
		expectTypeOf<ComponentSlots>().toHaveProperty('consentBannerRightLink');
		expectTypeOf<ComponentSlots>().toHaveProperty('consentBannerRightsRow');
		// The banner no longer renders a rights group, so no slot styles one.
		expectTypeOf<ComponentSlots>().not.toHaveProperty('consentBannerRights');
	});

	test('no theme slot maps onto a part the consent UI no longer renders', () => {
		const unbound = ['banner.actions', 'banner.rights', 'description.manager'];
		expect(
			Object.entries(THEME_SLOT_COMPONENT_KEYS).filter(([, target]) =>
				unbound.includes(target)
			)
		).toEqual([]);
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
