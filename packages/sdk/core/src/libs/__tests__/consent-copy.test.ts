import { describe, expect, it } from 'vitest';

import {
	resolveActionLabels,
	resolveCategoryTitle,
	resolveIABCopy,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
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
				devToolsLabel: 'inth DevTools',
				label: 'Datenschutz',
				toolbarLabel: 'Privacy controls',
			}
		);
	});
});
