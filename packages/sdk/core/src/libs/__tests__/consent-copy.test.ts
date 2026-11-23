import { translations as en } from '@inth/sdk-translations/en';
import { describe, expect, it } from 'vitest';

import type { RightsBundle } from '../consent-copy';
import {
	resolveActionLabels,
	resolveBannerAllowedAnnouncement,
	resolveCategoryTitle,
	resolveGpcNote,
	resolveIABCopy,
	resolveNoticeBarDescription,
	resolveOptInConfirmationSentence,
	resolveOptInPromptCopy,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
	resolvePreferencesRowCopy,
	resolvePrivacyChoicesCopy,
	resolvePromptCopy,
	resolveReceiptScope,
	resolveRightsBundle,
	resolveRightsPhrases,
	resolveSurfaceTranslations,
	resolveTriggerLabels,
	scopePhrase,
} from '../consent-copy';
import { resolveOptOutReceipt } from '../opt-out-state.model';

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

describe('privacy choices copy', () => {
	const BUNDLES: readonly RightsBundle[] = ['all', 'sale-share', 'sale-ads'];

	it('maps opt-out rights to a bundle', () => {
		expect(resolveRightsBundle(['sale', 'share', 'targeted_ads'])).toBe('all');
		expect(resolveRightsBundle(['targeted_ads', 'sale', 'share'])).toBe('all');
		expect(resolveRightsBundle(['sale', 'share'])).toBe('sale-share');
		expect(resolveRightsBundle(['sale', 'targeted_ads'])).toBe('sale-ads');
	});

	it('maps an unconfirmed or non-standard set to no bundle', () => {
		expect(resolveRightsBundle([])).toBeNull();
		expect(resolveRightsBundle(['sale'])).toBeNull();
		expect(resolveRightsBundle(['share', 'targeted_ads'])).toBeNull();
	});

	it('[COPY-01] the short banner phrase names each bundle', () => {
		expect(resolveRightsPhrases(undefined, 'all').short).toBe(
			'selling or sharing your data for ads'
		);
		expect(resolveRightsPhrases(undefined, 'sale-share').short).toBe(
			'selling or sharing your data'
		);
		expect(resolveRightsPhrases(undefined, 'sale-ads').short).toBe(
			'selling your data or using it for ads'
		);
	});

	it('[COPY-01] only the bundles with targeted ads mention ads', () => {
		for (const bundle of BUNDLES) {
			const phrases = Object.values(resolveRightsPhrases(undefined, bundle));
			for (const phrase of phrases) {
				expect(/\bads\b/u.test(phrase)).toBe(bundle !== 'sale-share');
			}
		}
	});

	it('[COPY-01] sale-ads never mentions sharing', () => {
		for (const phrase of Object.values(
			resolveRightsPhrases(undefined, 'sale-ads')
		)) {
			expect(phrase).not.toMatch(/shar/iu);
		}
	});

	it('scopes a choice to the browser, or to the account when signed in', () => {
		expect(scopePhrase(undefined)).toBe('on this browser');
		expect(scopePhrase(undefined, { business: 'Acme', signedIn: true })).toBe(
			'on this browser or for your Acme account'
		);
		expect(scopePhrase(undefined, { signedIn: true })).toBe(
			'on this browser or for your account'
		);
	});

	it('builds the US opt-in prompt for a bundle', () => {
		expect(
			resolveOptInPromptCopy(undefined, { bundle: 'all', business: 'Acme' })
		).toEqual({
			barDescription:
				'Acme asks before using optional cookies or selling or sharing your data for ads.',
			description:
				'With your permission, Acme would use optional cookies for site features and analytics, and sell or share your personal information, including for targeted ads. Nothing is turned on unless you allow it.',
			title: 'Your privacy choices',
		});
	});

	it('says "this site" without a business name, capitalised at a sentence start', () => {
		const copy = resolveOptInPromptCopy(undefined, { bundle: 'sale-share' });

		expect(copy.barDescription).toBe(
			'This site asks before using optional cookies or selling or sharing your data.'
		);
		expect(copy.description).toMatch(/^With your permission, this site would/u);
	});

	it('never recases a business name', () => {
		expect(
			resolveOptInPromptCopy(undefined, { bundle: 'all', business: 'eBay' })
				.barDescription
		).toMatch(/^eBay asks/u);
	});

	it('[GPC-04] the GPC note names the bundle and scope, and never says to turn the signal off', () => {
		const note = resolveGpcNote(undefined, {
			bundle: 'sale-share',
			business: 'Acme',
		});

		expect(note).toBe(
			"Your browser sent a Global Privacy Control signal, so Acme won't sell or share your personal information on this browser. Allow isn't available while the signal is on."
		);
		for (const bundle of BUNDLES) {
			for (const signedIn of [false, true]) {
				expect(resolveGpcNote(undefined, { bundle, signedIn })).not.toMatch(
					/turn off|turn the signal off/iu
				);
			}
		}
	});

	it('[GPC-04] the signed-in GPC note covers the account', () => {
		expect(
			resolveGpcNote(undefined, {
				bundle: 'sale-ads',
				business: 'Acme',
				signedIn: true,
			})
		).toContain(
			"Acme won't sell your personal information or use it for targeted ads on this browser or for your Acme account."
		);
	});

	it('[GPC-08] the notice bar says when the signal is honored', () => {
		expect(resolveNoticeBarDescription(undefined, false)).toBe(
			'We use cookies to run this site, measure traffic and personalize ads. You can opt out at any time.'
		);
		expect(resolveNoticeBarDescription(undefined, true)).toBe(
			'We use cookies to run this site and measure traffic. Your Global Privacy Control signal is honored.'
		);
	});

	it('announces an Allow that leaves the sale choice off', () => {
		expect(
			resolveBannerAllowedAnnouncement(undefined, { bundle: 'all', gpc: false })
		).toBe(
			'Optional cookies allowed. Selling, sharing and targeted ads stay off. You can change this in Your Privacy Choices.'
		);
		expect(
			resolveBannerAllowedAnnouncement(undefined, {
				bundle: 'sale-share',
				gpc: true,
			})
		).toBe(
			'Optional cookies allowed. Selling and sharing stay off because of your Global Privacy Control signal. You can change this in Your Privacy Choices.'
		);
	});

	it('states the receipt scope signed out and signed in', () => {
		expect(resolveReceiptScope(undefined)).toBe(
			'Applies to this browser. Sign in to apply it to your account too.'
		);
		expect(
			resolveReceiptScope(undefined, { business: 'Acme', signedIn: true })
		).toBe('Applies to this browser and your Acme account.');
		expect(resolveReceiptScope(undefined, { signedIn: true })).toBe(
			'Applies to this browser and your account.'
		);
	});

	it('[COPY-05] calls the cookie-category row Preferences', () => {
		expect(resolvePreferencesRowCopy(undefined, 2)).toEqual({
			close: 'Close preferences',
			onCount: '2 on',
			summary: 'Site features and analytics',
			title: 'Preferences',
		});
	});

	it('[EU-05] keeps the EU nested-sheet note from implying an immediate effect', () => {
		expect(resolvePrivacyChoicesCopy(undefined).nestedSheetNote).toBe(
			'Changes apply when you save in Privacy settings.'
		);
	});

	it('fills keys a language leaves out from English', () => {
		const copy = resolvePrivacyChoicesCopy({
			privacyChoices: { dialogIntro: 'Sus opciones se aplican de inmediato.' },
		});

		expect(copy.dialogIntro).toBe('Sus opciones se aplican de inmediato.');
		expect(copy.nudge).toBe(en.privacyChoices?.nudge);
		expect(resolvePrivacyChoicesCopy({ common: {} } as never)).toEqual(
			en.privacyChoices
		);
	});

	it('uses a translated template and phrases together', () => {
		expect(
			resolveOptInPromptCopy(
				{
					privacyChoices: {
						optInBarDescription:
							'{business} fragt vor optionalen Cookies oder {rights}.',
						shortAll: 'Verkauf deiner Daten',
					},
				},
				{ bundle: 'all', business: 'Acme' }
			).barDescription
		).toBe('Acme fragt vor optionalen Cookies oder Verkauf deiner Daten.');
	});

	it('never fills a placeholder that arrives inside a value', () => {
		expect(
			resolveOptInPromptCopy(undefined, {
				bundle: 'all',
				business: '{rights} Ltd',
			}).barDescription
		).toBe(
			'{rights} Ltd asks before using optional cookies or selling or sharing your data for ads.'
		);
	});

	it('leaves an unknown placeholder as written', () => {
		expect(
			resolveGpcNote(
				{ privacyChoices: { gpcNote: '{business} {rights} {scope} {other}' } },
				{ bundle: 'all', business: 'Acme' }
			)
		).toBe(
			"Acme won't sell or share your personal information or use it for targeted ads on this browser {other}"
		);
	});

	it('leaves a placeholder named after an Object.prototype key as written', () => {
		expect(
			resolveGpcNote(
				{ privacyChoices: { gpcNote: '{business} {constructor}' } },
				{ bundle: 'all', business: 'Acme' }
			)
		).toBe('Acme {constructor}');
		expect(
			scopePhrase(
				{ privacyChoices: { scopeAccount: 'for {business} {constructor}' } },
				{ business: 'Acme', signedIn: true }
			)
		).toBe('for Acme {constructor}');
	});
});
