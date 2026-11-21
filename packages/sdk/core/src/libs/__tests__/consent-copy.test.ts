import { translations as en } from '@inth/sdk-translations/en';
import { describe, expect, it } from 'vitest';

import {
	resolveActionLabels,
	resolveCategoryTitle,
	resolveIABCopy,
	resolveOptInConfirmationSentence,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
	resolveSurfaceTranslations,
	resolveTriggerLabels,
} from '../consent-copy';
import { resolveOptOutReceipt } from '../opt-out-state';

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
			'opt-out': 'Do Not Sell or Share My Personal Information',
			preferences: 'Manage preferences',
		});
	});

	it('resolves the opt-out link presentation for each variant with English fallbacks', () => {
		expect(resolveOptOutLink(undefined)).toEqual({
			label: 'Do Not Sell or Share My Personal Information',
			variant: 'do-not-sell',
		});
		expect(resolveOptOutLink(undefined, 'do-not-sell')).toEqual({
			label: 'Do Not Sell or Share My Personal Information',
			variant: 'do-not-sell',
		});
		expect('icon' in resolveOptOutLink(undefined, 'do-not-sell')).toBe(false);

		expect(resolveOptOutLink(undefined, 'privacy-choices')).toEqual({
			icon: 'cppa-opt-out',
			label: 'Your Privacy Choices',
			variant: 'privacy-choices',
		});
		expect(resolveOptOutLink(undefined, 'california-privacy-choices')).toEqual({
			icon: 'cppa-opt-out',
			label: 'Your California Privacy Choices',
			variant: 'privacy-choices',
		});

		const translated = {
			rights: {
				californiaPrivacyChoices: 'Sus opciones de privacidad de California',
				optOut: 'No vender ni compartir mi información personal',
				privacyChoices: 'Sus opciones de privacidad',
			},
		};
		expect(resolveOptOutLink(translated, 'do-not-sell')).toEqual({
			label: 'No vender ni compartir mi información personal',
			variant: 'do-not-sell',
		});
		expect(resolveOptOutLink(translated, 'privacy-choices')).toEqual({
			icon: 'cppa-opt-out',
			label: 'Sus opciones de privacidad',
			variant: 'privacy-choices',
		});
		expect(resolveOptOutLink(translated, 'california-privacy-choices')).toEqual(
			{
				icon: 'cppa-opt-out',
				label: 'Sus opciones de privacidad de California',
				variant: 'privacy-choices',
			}
		);

		// Missing keys inside a partial rights section fall back to English.
		expect(resolveOptOutLink({ rights: {} }, 'privacy-choices')).toEqual({
			icon: 'cppa-opt-out',
			label: 'Your Privacy Choices',
			variant: 'privacy-choices',
		});
		expect(
			resolveOptOutLink({ rights: {} }, 'california-privacy-choices')
		).toEqual({
			icon: 'cppa-opt-out',
			label: 'Your California Privacy Choices',
			variant: 'privacy-choices',
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

	it('resolves opt-out copy from the bundle with English fallbacks', () => {
		expect(resolveOptOutCopy(undefined)).toEqual(en.optOut);
		expect(
			resolveOptOutCopy({
				optOut: {
					done: 'Fertig',
					statusRequest: 'Widerspruch berücksichtigt',
				},
			})
		).toEqual({
			...en.optOut,
			done: 'Fertig',
			statusRequest: 'Widerspruch berücksichtigt',
		});
	});

	it('resolves the receipt sentence for neutral and confirmed rights combinations', () => {
		expect(
			resolveOptOutReceiptSentence(en, { rights: [], scope: 'browser' })
		).toBe("You're opted out on this browser.");
		expect(
			resolveOptOutReceiptSentence(en, { rights: [], scope: 'account' })
		).toBe("You're opted out on this browser and your account.");
		expect(
			resolveOptOutReceiptSentence(en, {
				rights: ['sale', 'share'],
				scope: 'browser',
			})
		).toBe("You're opted out of sale and sharing on this browser.");
		expect(
			resolveOptOutReceiptSentence(en, {
				rights: ['sale', 'targeted_ads'],
				scope: 'browser',
			})
		).toBe(
			"You're opted out of sale and targeted advertising on this browser."
		);
		expect(
			resolveOptOutReceiptSentence(en, {
				rights: ['sale', 'share', 'targeted_ads'],
				scope: 'account',
			})
		).toBe(
			"You're opted out of sale, sharing and targeted advertising on this browser and your account."
		);
		// Any other combination falls back to the neutral sentence.
		expect(
			resolveOptOutReceiptSentence(en, { rights: ['sale'], scope: 'browser' })
		).toBe("You're opted out on this browser.");
		expect(
			resolveOptOutReceiptSentence(en, {
				rights: ['share', 'targeted_ads'],
				scope: 'account',
			})
		).toBe("You're opted out on this browser and your account.");
	});

	it('resolves the opt-out block heading from confirmed rights and stays neutral before confirmation', () => {
		expect(resolveOptOutBlockHeading(en, { rights: [] })).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(
			resolveOptOutBlockHeading(en, { rights: [] }, 'privacy-choices')
		).toBe('Your Privacy Choices');
		expect(
			resolveOptOutBlockHeading(
				en,
				{ rights: [] },
				'california-privacy-choices'
			)
		).toBe('Your California Privacy Choices');

		expect(resolveOptOutBlockHeading(en, { rights: ['sale', 'share'] })).toBe(
			'Sale and sharing of your personal information'
		);
		expect(
			resolveOptOutBlockHeading(en, { rights: ['sale', 'targeted_ads'] })
		).toBe('Sale of your personal information and targeted advertising');
		expect(
			resolveOptOutBlockHeading(en, {
				rights: ['sale', 'share', 'targeted_ads'],
			})
		).toBe(
			'Sale and sharing of your personal information and targeted advertising'
		);

		// Unlisted combinations stay on the configured link title.
		expect(
			resolveOptOutBlockHeading(en, { rights: ['sale'] }, 'privacy-choices')
		).toBe('Your Privacy Choices');
		expect(
			resolveOptOutBlockHeading(
				en,
				{ rights: ['share', 'targeted_ads'] },
				'do-not-sell'
			)
		).toBe('Do Not Sell or Share My Personal Information');

		// A local all-three fallback before backend confirmation stays neutral.
		const unconfirmedReceipt = resolveOptOutReceipt(
			{
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: 1_700_000_000_000,
					rights: ['sale', 'share', 'targeted_ads'],
				},
			},
			{
				localAct: 'button',
				reference: 'ref-local-fallback',
				rightsConfirmed: false,
			}
		);
		expect(
			resolveOptOutBlockHeading(en, unconfirmedReceipt, 'privacy-choices')
		).toBe('Your Privacy Choices');
	});

	it('resolves the opt-in confirmation sentence neutrally before confirmation and names confirmed rights after', () => {
		expect(resolveOptInConfirmationSentence(en, { rights: [] })).toBe(
			'Confirming ends your opt-out on this browser.'
		);
		expect(
			resolveOptInConfirmationSentence(en, { rights: ['sale', 'share'] })
		).toBe('Confirming ends your opt-out of sale and sharing on this browser.');
		expect(
			resolveOptInConfirmationSentence(en, {
				rights: ['sale', 'targeted_ads'],
			})
		).toBe(
			'Confirming ends your opt-out of sale and targeted advertising on this browser.'
		);
		expect(
			resolveOptInConfirmationSentence(en, {
				rights: ['sale', 'share', 'targeted_ads'],
			})
		).toBe(
			'Confirming ends your opt-out of sale, sharing and targeted advertising on this browser.'
		);
		expect(resolveOptInConfirmationSentence(en, { rights: ['sale'] })).toBe(
			'Confirming ends your opt-out on this browser.'
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
			translations: { translations: bundle },
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
				translations: { translations: bundle },
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
