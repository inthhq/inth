import { MINIMAL_GVL } from '@inth/conformance/fixtures/gvl';
import { describe, expect, it } from 'vitest';

import { iabPromptClassNames } from '../banner/banner-class-names.model';
import { buildIABPrompt } from '../browser/render-iab-prompt-into-slot';
import { resolveOptions } from '../integration';
import { resolveConsentContext } from '../server';
import { testing as testingMode } from '../testing';

describe('browser-rendered IAB banner and theme.slots', () => {
	it('adds slot classes to the IAB parts they name', async () => {
		const locals = await resolveConsentContext({
			headers: new Headers(),
			options: resolveOptions({
				consentCategories: ['necessary', 'marketing'],
				iab: { cmpId: 160, gvl: MINIMAL_GVL as never },
				mode: testingMode({
					policy: [
						{
							categories: ['marketing'],
							id: 'astro_iab_test',
							match: { fallback: true },
							model: 'iab',
							prompt: 'choice',
							scopeMode: 'permissive',
						} as never,
					],
				}),
			}),
		});
		const host = document.createElement('div');
		host.append(
			...buildIABPrompt(
				locals.snapshot,
				{ classNames: iabPromptClassNames, props: {} },
				{
					theme: {
						slots: {
							buttonPrimary: 'brand-primary',
							iabConsentBanner: 'brand-iab-banner',
							iabConsentBannerCard: {
								className: 'brand-iab-card',
								style: { borderTopWidth: '4px' },
							},
							iabConsentBannerFooter: 'brand-iab-footer',
							iabConsentBannerHeader: 'brand-iab-header',
							iabConsentBannerTag: 'brand-iab-tag',
						},
					},
				}
			)
		);
		const part = (testId: string): HTMLElement | null =>
			host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

		expect(part('iab-consent-banner-root')?.classList).toContain(
			'brand-iab-banner'
		);
		expect(part('iab-consent-banner-card')?.classList).toContain(
			'brand-iab-card'
		);
		expect(part('iab-consent-banner-card')?.style.borderTopWidth).toBe('4px');
		expect(part('iab-consent-banner-header')?.classList).toContain(
			'brand-iab-header'
		);
		expect(part('iab-consent-banner-footer')?.classList).toContain(
			'brand-iab-footer'
		);
		expect(part('iab-consent-banner-branding')?.classList).toContain(
			'brand-iab-tag'
		);
		expect(part('iab-consent-banner-customize-button')?.classList).toContain(
			'brand-primary'
		);
	});
});
