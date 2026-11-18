import { translations as en } from '@inth/sdk-translations/en';
import { describe, expect, it } from 'vitest';

import {
	resolveActionLabels,
	resolveCategoryTitle,
	resolveIABCopy,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
	resolveSurfaceTranslations,
	resolveTriggerLabels,
} from '../consent-copy';

describe('consent copy', () => {
	it('reads the notice copy on a notice prompt', () => {
		expect(
			resolvePromptCopy(
				{
					cookieBanner: {
						description: 'Choose',
						noticeDescription: 'We use cookies',
						noticeTitle: 'Notice',
						title: 'Choice',
					},
				},
				'notice'
			)
		).toEqual({ description: 'We use cookies', title: 'Notice' });
	});

	it('falls back to the same language before English on a notice', () => {
		expect(
			resolvePromptCopy(
				{ cookieBanner: { description: 'Wählen', title: 'Auswahl' } },
				'notice'
			)
		).toEqual({ description: 'Wählen', title: 'Auswahl' });
	});

	it('reads the choice copy on a choice prompt', () => {
		expect(
			resolvePromptCopy(
				{
					cookieBanner: {
						description: 'Choose',
						noticeTitle: 'Notice',
						title: 'Choice',
					},
				},
				'choice'
			)
		).toEqual({ description: 'Choose', title: 'Choice' });
	});

	it('labels dismiss with acknowledge, then dismiss', () => {
		expect(
			resolveActionLabels({ common: { acknowledge: 'Got it', dismiss: 'X' } })
				.dismiss
		).toBe('Got it');
		expect(
			resolveActionLabels({ common: { dismiss: 'Close it' } }).dismiss
		).toBe('Close it');
	});

	it('fills missing labels from English', () => {
		expect(
			resolveActionLabels({ common: { acceptAll: 'Tout accepter' } })
		).toEqual({
			accept: 'Tout accepter',
			customize: 'Customize',
			dismiss: 'OK',
			reject: 'Reject All',
			save: 'Save Settings',
		});
		expect(resolvePreferenceControlLabels(undefined)).toEqual({
			'opt-out': 'Do not sell or share my data',
			preferences: 'Manage preferences',
		});
	});

	it('titles a category from its language, then English, then its name', () => {
		expect(
			resolveCategoryTitle(
				{ consentTypes: { measurement: { title: 'Statistik' } } },
				'measurement'
			)
		).toBe('Statistik');
		expect(resolveCategoryTitle({ consentTypes: {} }, 'measurement')).toBe(
			'Analytics'
		);
		expect(resolveCategoryTitle(undefined, 'product_updates')).toBe(
			'Product Updates'
		);
	});

	it('fills IAB copy key by key from English', () => {
		const iab = resolveIABCopy({
			iab: { preferenceCenter: { vendorList: { search: 'Suchen' } } },
		});
		expect(iab.preferenceCenter.vendorList.search).toBe('Suchen');
		expect(iab.preferenceCenter.vendorList.maxAgeRefreshes).toBe('(refreshes)');
		expect(iab.common.acceptAll).toBe('Accept All');
	});

	it('labels the trigger from the bundle, else English', () => {
		expect(resolveTriggerLabels({ trigger: { label: 'Datenschutz' } })).toEqual(
			{
				devToolsLabel: 'Inth DevTools',
				label: 'Datenschutz',
				toolbarLabel: 'Privacy controls',
			}
		);
	});
});

describe('resolveSurfaceTranslations', () => {
	it('fills every key a partial bundle leaves out from English', () => {
		const bundle = {
			consentTypes: { custom_tracking: { description: 'D', title: 'T' } },
			cookieBanner: { title: 'Hallo' },
		};
		const t = resolveSurfaceTranslations({
			translations: { language: 'de', translations: bundle },
		});
		expect(t.cookieBanner.title).toBe('Hallo');
		expect(t.cookieBanner.description).toBe(en.cookieBanner.description);
		expect(t.consentManagerDialog).toEqual(en.consentManagerDialog);
		expect(t.consentTypes.marketing).toEqual(en.consentTypes.marketing);
		expect((t.consentTypes as Record<string, unknown>).custom_tracking).toEqual(
			{ description: 'D', title: 'T' }
		);
		expect(
			resolveSurfaceTranslations({
				translations: { language: 'de', translations: bundle },
			})
		).toBe(t);
	});

	it('is English without a bundle', () => {
		expect(resolveSurfaceTranslations({ translations: null })).toBe(en);
	});

	it('keeps the own choice copy of a bundle for a notice it does not translate', () => {
		const t = resolveSurfaceTranslations({
			translations: { translations: { cookieBanner: { title: 'Hallo' } } },
		});
		expect(resolvePromptCopy(t, 'notice').title).toBe('Hallo');
		expect(resolvePromptCopy(t, 'notice').description).toBe(
			en.cookieBanner.noticeDescription
		);
	});

	it('reads the legacy frame and dismiss keys', () => {
		const t = resolveSurfaceTranslations({
			translations: {
				translations: {
					common: { dismiss: 'OK' },
					frame: { title: 'Blocked' },
				},
			},
		});
		expect(t.consentGate.title).toBe('Blocked');
		expect(t.common.acknowledge).toBe('OK');
	});
});
