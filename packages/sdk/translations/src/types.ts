export type AllConsentNames =
	| 'experience'
	| 'functionality'
	| 'marketing'
	| 'measurement'
	| 'necessary';

export interface CommonTranslations {
	/** Acknowledges a notice without recording consent. */
	acknowledge: string;
	acceptAll: string;
	rejectAll: string;
	customize: string;
	save: string;
	close: string;
	/**
	 * Lead-in of the attribution tag, which the brand mark finishes:
	 * "Consent by [INTH]". It names who provides the consent tool, so it must
	 * not read as a security or privacy assurance.
	 */
	securedBy: string;
	/** Acknowledges a notice prompt without recording a choice. */
	dismiss: string;
}

/**
 * Labels for buttons that open preferences, including the opt-out button
 * on a notice prompt.
 */
export interface RightsTranslations {
	/** California-specific alternative opt-out link title. Always renders with the opt-out icon. */
	californiaPrivacyChoices: string;
	/** Opt-out right. Keeps the statutory "do not sell or share" meaning. */
	optOut: string;
	/** Preferences right; opens the preference center. */
	preferences: string;
	/** Alternative opt-out link title. Always renders with the opt-out icon. */
	privacyChoices: string;
}

/** Accessible names for the floating trigger that reopens preferences. */
export interface TriggerTranslations {
	/** Accessible name of the trigger button. */
	label: string;
	/** Accessible name of the toolbar that holds the trigger and DevTools. */
	toolbarLabel: string;
	/** Accessible name of the toolbar item that opens DevTools. */
	devToolsLabel: string;
}

/** Copy for the opt-out confirmation view and opt-out notices in preferences. */
export interface OptOutTranslations {
	/** Label of the direct opt-out button in the preference center. */
	action: string;
	/** Status shown when the visitor's own opt-out request is honored. */
	statusRequest: string;
	/** Status shown when a Global Privacy Control signal is honored. */
	statusSignal: string;
	/** Neutral status sentence shown when the visitor has not opted out on this browser. */
	notOptedOut: string;
	/** Cancel button label in the two-step opt-in confirmation dialog. */
	optInCancel: string;
	/** Confirm button label in the two-step opt-in confirmation dialog. */
	optInConfirm: string;
	/** Neutral body sentence in the two-step opt-in confirmation dialog. */
	optInDescription: string;
	/** Body sentence naming confirmed rights in the two-step opt-in confirmation dialog. Use `{rights}`. */
	optInDescriptionWithRights: string;
	/** Link label in the sale-and-sharing block to start opting back in. */
	optInLink: string;
	/** Title of the two-step opt-in confirmation dialog. */
	optInTitle: string;
	/** Block heading when confirmed rights are `sale` and `share`. */
	headingSaleAndShare: string;
	/** Block heading when confirmed rights are `sale` and `targeted_ads`. */
	headingSaleAndTargetedAds: string;
	/** Block heading when confirmed rights are `sale`, `share` and `targeted_ads`. */
	headingAll: string;
	/**
	 * Body text in the opt-out confirmation view.
	 * @deprecated Use the receipt keys (`receiptBrowser`, `receiptAccount`, etc.).
	 */
	description: string;
	/** Neutral receipt sentence when only this browser is covered. */
	receiptBrowser: string;
	/** Neutral receipt sentence when this browser and the account are covered. */
	receiptAccount: string;
	/** Receipt sentence naming confirmed rights for this browser. Use `{rights}`. */
	receiptBrowserWithRights: string;
	/** Receipt sentence naming confirmed rights for this browser and account. Use `{rights}`. */
	receiptAccountWithRights: string;
	/** Confirmed rights phrase for `sale` and `share`. */
	rightsSaleAndShare: string;
	/** Confirmed rights phrase for `sale` and `targeted_ads`. */
	rightsSaleAndTargetedAds: string;
	/** Confirmed rights phrase for `sale`, `share` and `targeted_ads`. */
	rightsAll: string;
	/** Label for the recorded time line in the opt-out receipt. */
	recordedLabel: string;
	/** Label for the local reference line in the opt-out receipt. */
	referenceLabel: string;
	/** Label of the single button that closes the opt-out confirmation view. */
	done: string;
	/** Notice shown on a category locked off by an active GPC signal. */
	lockedByGpc: string;
	/** Notice shown on a category held off by an account-level opt-out. */
	lockedByAccount: string;
}

/**
 * Copy for the Privacy Choices surfaces: the slim banner, the US opt-in and
 * notice prompts, the "Your Privacy Choices" dialog and their screen-reader
 * announcements.
 *
 * Placeholders: `{business}` is the site's name, `{rights}` a phrase for the
 * configured rights bundle (one of the `*All`, `*SaleAndShare` and
 * `*SaleAndTargetedAds` keys below), `{scope}` the `scope*` phrase and
 * `{count}` a number. Read them through the builders in `@inth/sdk-core`
 * (`resolvePrivacyChoicesCopy` and its helpers) rather than by hand, so each
 * sentence names exactly the rights the choice controls.
 */
export interface PrivacyChoicesTranslations {
	/** Stands in for `{business}` when the site has not set its name. */
	businessFallback: string;
	/** One-line EU banner text. */
	barDescription: string;
	/** Title of the US opt-in prompt. */
	optInTitle: string;
	/** Body of the US opt-in card. Use `{business}` and `{rights}` (an `ask*` phrase). */
	optInDescription: string;
	/** One-line US opt-in banner text. Use `{business}` and `{rights}` (a `short*` phrase). */
	optInBarDescription: string;
	/** One-line US notice banner text. */
	noticeBarDescription: string;
	/** One-line US notice banner text while a Global Privacy Control signal is honored. */
	noticeBarDescriptionGpc: string;
	/** First line of the dialog in the US. The GPC note replaces it when the signal is on. */
	dialogIntro: string;
	/**
	 * Note on the sale row while a Global Privacy Control signal is on. Use
	 * `{business}`, `{rights}` (a `refuse*` phrase) and `{scope}`. Never tell
	 * the visitor to turn the signal off.
	 */
	gpcNote: string;
	/** Scope while signed out, for `{scope}`. */
	scopeBrowser: string;
	/** Scope while signed in, for `{scope}`. Use `{business}`. */
	scopeAccount: string;
	/** Scope while signed in when the site has not set its name. */
	scopeAccountUnnamed: string;
	/** What the visitor is asked to allow, `sale`, `share` and `targeted_ads`. */
	askAll: string;
	/** What the visitor is asked to allow, `sale` and `share`. */
	askSaleAndShare: string;
	/** What the visitor is asked to allow, `sale` and `targeted_ads`. */
	askSaleAndTargetedAds: string;
	/** What the site will not do, `sale`, `share` and `targeted_ads`. Starts with the verb. */
	refuseAll: string;
	/** What the site will not do, `sale` and `share`. */
	refuseSaleAndShare: string;
	/** What the site will not do, `sale` and `targeted_ads`. */
	refuseSaleAndTargetedAds: string;
	/** Short form for the one-line opt-in banner, `sale`, `share` and `targeted_ads`. */
	shortAll: string;
	/** Short form for the one-line opt-in banner, `sale` and `share`. */
	shortSaleAndShare: string;
	/** Short form for the one-line opt-in banner, `sale` and `targeted_ads`. */
	shortSaleAndTargetedAds: string;
	/** Name of the rights as a sentence subject, `sale`, `share` and `targeted_ads`. */
	titleAll: string;
	/** Name of the rights as a sentence subject, `sale` and `share`. */
	titleSaleAndShare: string;
	/** Name of the rights as a sentence subject, `sale` and `targeted_ads`. */
	titleSaleAndTargetedAds: string;
	/** Announced when pressing Allow while the opt-in confirmation is open. */
	nudge: string;
	/** Announced when a banner's Customize expands its options in place. */
	panelExpanded: string;
	/** Announced after Reject all on a banner. */
	bannerRejected: string;
	/** Announced after Save choices on a banner. */
	choicesSaved: string;
	/**
	 * Announced after Allow on a banner while the sale choice stays off.
	 * Use `{rights}` (a `title*` phrase).
	 */
	bannerAllowedRightsOff: string;
	/** As `bannerAllowedRightsOff`, while a Global Privacy Control signal keeps them off. */
	bannerAllowedRightsOffGpc: string;
	/** Receipt scope while signed out. */
	receiptScopeBrowser: string;
	/** Receipt scope while signed in. Use `{business}`. */
	receiptScopeAccount: string;
	/** Receipt scope while signed in when the site has not set its name. */
	receiptScopeAccountUnnamed: string;
	/** Note in an EU nested sheet: changes wait for Save in the dialog. */
	nestedSheetNote: string;
	/** Label of the fallback field shown when copying the reference fails. */
	copyFailed: string;
	/** Title of the cookie-category row and its sheet. */
	preferencesTitle: string;
	/** What the cookie-category row covers. */
	preferencesSummary: string;
	/** How many optional categories are on. Use `{count}`. */
	preferencesOnCount: string;
	/** Accessible name of the button that closes the preferences sheet. */
	preferencesClose: string;
	/** "Allow" on a US opt-in banner, and the permissive option of a rights row. */
	allow: string;
	/** "Don't allow" on a US opt-in banner, and the protective option of an opt-in rights row. */
	dontAllow: string;
	/** The protective option of an opt-out rights row. */
	optOutOption: string;
	/** Expands the one-line US opt-in banner. */
	choose: string;
	/** Expands the US opt-in card and drawer. */
	chooseWhatToAllow: string;
	/** Expands the US notice to its rights rows. */
	noticeRightsAction: string;
	/** Refuses every optional category in an expanded panel or a side drawer. */
	rejectAll: string;
	/** Grants every optional category in an expanded panel or a side drawer. */
	acceptAll: string;
	/** Records the switches in an expanded panel or a side drawer. */
	saveChoices: string;
	/** Added to the US notice while a Global Privacy Control signal is honored. */
	noticeGpcHonored: string;
	/** Sale row description while allowed. Use `{business}` and `{rights}` (an `ask*` phrase). */
	saleAllowed: string;
	/**
	 * Sale row description after the visitor refused. Use `{business}`,
	 * `{rights}` (a `refuse*` phrase) and `{scope}`.
	 */
	saleRefused: string;
	/**
	 * Sale row description while the refusal is only the opt-in default.
	 * Use `{business}` and `{rights}` (a `refuse*` phrase).
	 */
	saleOffByDefault: string;
	/** Accessible name of an opt-in sale control. Use `{rights}` (a `title*` phrase, lower case). */
	saleGroupOptIn: string;
	/** Accessible name of an opt-out sale control for the sale and targeted ads bundle. */
	saleGroupSaleAndTargetedAds: string;
	/** Confirmation title before granting under opt-in. Use `{rights}` (lower case). */
	confirmTitleOptIn: string;
	/** Confirmation title before lifting an opt-out. Use `{rights}` (lower case). */
	confirmTitleOptOut: string;
	/** Confirmation body under opt-in. Use `{business}` and `{rights}` (an `ask*` phrase). */
	confirmDescriptionOptIn: string;
	/** Confirmation body before lifting an opt-out. Use `{business}` and `{rights}` (an `ask*` phrase). */
	confirmDescriptionOptOut: string;
	/** The confirmation's cancel button before lifting an opt-out. */
	confirmKeepOptedOut: string;
	/** Read-only row that says advertising follows the sale choice (LAW-05). */
	advertisingFollowsSale: string;
	/** In place of a switch for a category that is always on. */
	alwaysOn: string;
	/** Title of the US dialog. */
	dialogTitle: string;
	/** Title of the EU dialog. */
	euDialogTitle: string;
	/** First line of the EU dialog. Use `{business}`. */
	euDialogIntro: string;
	/** Accessible name of the dialog's close button. */
	close: string;
	/** Closes the US dialog or a phone sheet. Never changes to say it saved (SR-07). */
	done: string;
	/** The cue beside Done after a change applies. */
	savedCue: string;
	/** Announced after a change applies in the US. Use `{message}`. */
	announceSaved: string;
	/** Announced when a default becomes the visitor's recorded choice. */
	choiceRecorded: string;
	/** Announced after opting out. Use `{rights}` (a `title*` phrase, lower case). */
	rightsOptedOut: string;
	/** Announced after allowing. Use `{rights}` (a `title*` phrase). */
	rightsAllowed: string;
	/** Announced after refusing under opt-in. Use `{rights}` (a `title*` phrase). */
	rightsNotAllowed: string;
	/** Announced when a category or vendor turns on. Use `{name}`. */
	switchedOn: string;
	/** Announced when a category or vendor turns off. Use `{name}`. */
	switchedOff: string;
	/** Receipt line for a choice stored in this browser. Use `{date}`. */
	receiptSavedBrowser: string;
	/** Receipt line for a choice stored on the account. Use `{date}`. */
	receiptSavedAccount: string;
	/** Receipt line while a Global Privacy Control signal is honored live (GPC-06). */
	receiptLive: string;
	/** Receipt detail for a live Global Privacy Control signal. */
	receiptLiveDetail: string;
	/** The receipt's disclosure. */
	receiptDetails: string;
	/** Receipt item for a refusal. Use `{rights}` (a `title*` phrase, lower case). */
	receiptOptedOut: string;
	/** Receipt item for a grant. Use `{rights}` (a `title*` phrase, lower case). */
	receiptAllowed: string;
	/** Where a live refusal comes from. */
	receiptViaGpc: string;
	/** Where a kept refusal came from (GPC-05). */
	receiptFromGpc: string;
	/** When the choice was recorded. Use `{date}`. */
	receiptRecorded: string;
	/** Label before the receipt reference. */
	receiptReference: string;
	/** Accessible name of the copy button. */
	copyReference: string;
	/** Announced once the reference is on the clipboard. */
	referenceCopied: string;
	/** Announced when copying failed. */
	copyFailedAnnouncement: string;
	/** Stands in for a date recorded a moment ago. */
	justNow: string;
	/** Name of the read-only advertising row in the US (LAW-05). */
	advertisingTitle: string;
	/** The read-only advertising row while on. */
	stateOn: string;
	/** The read-only advertising row while off. */
	stateOff: string;
	/** First line of the US preferences sheet. */
	preferencesSheetIntro: string;
	/** Footer note of a US phone sheet (NEST-08). */
	savedAutomatically: string;
	/** Footer note of an EU phone sheet (NEST-08). */
	saveInSettings: string;
	/** Opens a category's vendors. Use `{count}`. */
	vendorsView: string;
	/** Opens a category's only vendor. */
	vendorsViewOne: string;
	/** Closes a category's vendors. Use `{count}`. */
	vendorsHide: string;
	/** Closes a category's only vendor. */
	vendorsHideOne: string;
	/** Read after the vendor trigger's text, for screen readers. Use `{category}`. */
	vendorsFor: string;
	/** How many of a category's vendors are on. Use `{count}`. */
	vendorsOnCount: string;
	/** Accessible name of a category's vendor table, and the title of its sheet. Use `{category}`. */
	vendorsTable: string;
	/** Accessible name of the button that closes a vendor sheet. Use `{category}`. */
	vendorsClose: string;
	/** Vendor table column. */
	vendorColumn: string;
	/** Vendor table column. */
	purposeColumn: string;
	/** Vendor table column, for screen readers. */
	policyColumn: string;
	/** Vendor table column, for screen readers. */
	switchColumn: string;
	/** Accessible name of a vendor's privacy policy link (CAT-07). Use `{vendor}`. */
	vendorPolicy: string;
}

export interface LegalLinksTranslations {
	privacyPolicy: string;
	cookiePolicy: string;
	termsOfService: string;
}

export interface CookieBannerTranslations {
	title: string;
	description: string;
	/** Title shown when the active policy requires a notice prompt. */
	noticeTitle: string;
	/** Description shown when the active policy requires a notice prompt. */
	noticeDescription: string;
}

export interface ConsentManagerDialogTranslations {
	title: string;
	description: string;
	/** Copy for vendor rows nested under a category. Optional in translations. */
	vendors?: Partial<VendorListTranslations>;
}

/** Copy for the vendor list inside the preference center. */
export interface VendorListTranslations {
	/**
	 * Accessible name of the vendor list inside one category. Use the
	 * `{count}` placeholder for the number of vendors listed.
	 */
	title: string;
	/** Link text to a vendor's privacy policy. */
	privacyPolicy: string;
	/** Hint shown while the parent category is off, so vendor switches are disabled. */
	disabledByCategory: string;
	/** Accessible label for a vendor switch, with a {vendor} placeholder. */
	switchLabel: string;
}

export interface ConsentTypeTranslations {
	title: string;
	description: string;
}

/**
 * Copy for the placeholder `ConsentGate` renders while its category is
 * denied.
 */
export interface ConsentGateTranslations {
	/**
	 * You can use the {category} placeholder to dynamically insert the consent category name.
	 */
	title: string;
	/**
	 * You can use the {category} placeholder to dynamically insert the consent category name.
	 */
	actionButton: string;
	/**
	 * Message shown when the gate's category is blocked by active policy scope.
	 */
	policyBlocked: string;
	/**
	 * Message shown while consent-gated content is loading.
	 */
	loading?: string;
	/**
	 * Message shown when consent-gated content cannot be loaded.
	 */
	error?: string;
}

/**
 * @deprecated Renamed to {@link ConsentGateTranslations}.
 */
export type FrameTranslations = ConsentGateTranslations;

export interface IABBannerTranslations {
	title: string;
	/**
	 * Use {partnerCount} placeholder to insert the partner count.
	 */
	description: string;
	/**
	 * Use {count} placeholder to insert the partner count.
	 */
	partnersLink: string;
	/**
	 * Use {count} placeholder to insert the remaining purposes count.
	 */
	andMore: string;
	legitimateInterestNotice: string;
	/** Consent scope for service-specific setups */
	scopeServiceSpecific: string;
	/** Consent scope for group or network setups */
	scopeGroup: string;
}

export interface IABPreferenceCenterTranslations {
	title: string;
	description: string;
	tabs: {
		purposes: string;
		vendors: string;
	};
	purposeItem: {
		/**
		 * Use {count} placeholder for partner count.
		 */
		partners: string;
		/**
		 * Use {count} placeholder for vendor count.
		 */
		vendorsUseLegitimateInterest: string;
		examples: string;
		partnersUsingPurpose: string;
		withYourPermission: string;
		/** Standard terminology for legitimate interest */
		legitimateInterest: string;
		/** Button text for objecting to LI processing */
		objectButton: string;
		/** Text shown when user has objected to LI */
		objected: string;
		/** Explanation about right to object to LI */
		rightToObject: string;
	};
	specialPurposes: {
		title: string;
		tooltip: string;
	};
	/** Informational Features section (TCF Policies v5.0.b). */
	features?: {
		title: string;
		/**
		 * Explains that Features only serve the purposes the user chooses.
		 * Used when the vendor list has no `standardTexts.features`.
		 */
		description: string;
	};
	vendorList: {
		search: string;
		/**
		 * Use {filtered} and {total} placeholders.
		 */
		showingCount: string;
		iabVendorsHeading: string;
		iabVendorsNotice: string;
		customVendorsHeading: string;
		customVendorsNotice: string;
		/** Heading of the Google Additional Consent provider section. */
		adTechProvidersHeading: string;
		/**
		 * Explains Google ad tech providers outside the TCF, and that consent
		 * to one also needs device storage and personalised advertising.
		 */
		adTechProvidersNotice: string;
		purposes: string;
		specialPurposes: string;
		specialFeatures: string;
		features: string;
		dataCategories: string;
		usesCookies: string;
		nonCookieAccess: string;
		/**
		 * Use {days} placeholder for max age in days.
		 */
		maxAge: string;
		/** Suffix shown when cookie max age refreshes. */
		maxAgeRefreshes?: string;
		/**
		 * Use {days} placeholder for retention in days.
		 */
		retention: string;
		/** Use {days} placeholder. Shown per-purpose/special-purpose. */
		retainedDays?: string;
		legitimateInterest: string;
		privacyPolicy: string;
		storageDisclosure: string;
		requiredNotice: string;
		/** Use {searchTerm} placeholder. */
		noVendorsFound?: string;
		/** Use {count} placeholder for partner count. */
		partnerCount?: string;
		partnerSingular?: string;
		partnerPlural?: string;
	};
	footer: {
		consentStorage: string;
	};
}

export interface IABCommonTranslations {
	acceptAll: string;
	rejectAll: string;
	customize: string;
	saveSettings: string;
	loading: string;
	showingSelectedVendor: string;
	clearSelection: string;
	customPartner: string;
}

/**
 * IAB copy for native mobile apps, where the web copy's "website" and
 * cookie wording does not apply. The Inth iOS and Android SDKs read it
 * through generated files (`scripts/generate-native-iab-copy.ts`).
 */
export interface IABAppTranslations {
	/** Use {partnerCount} placeholder to insert the partner count. */
	description: string;
	/** Consent scope for a service-specific app. */
	scopeServiceSpecific: string;
	/** Tells the user how and where to withdraw consent in the app. */
	withdraw: string;
	/** Explains legitimate interest and the right to object. */
	legitimateInterestExplanation: string;
	/** Use {days} placeholder for the storage duration in days. */
	consentStorage: string;
}

export interface IABTranslations {
	/**
	 * Copy for native mobile apps. Optional so custom translation objects
	 * keep compiling; every built-in language provides it.
	 */
	app?: IABAppTranslations;
	banner: IABBannerTranslations;
	preferenceCenter: IABPreferenceCenterTranslations;
	common: IABCommonTranslations;
}

export type ConsentTypesTranslations = {
	[key in AllConsentNames]: ConsentTypeTranslations;
};

// Complete translations interface (used for English/default language)
export interface CompleteTranslations {
	common: CommonTranslations;
	cookieBanner: CookieBannerTranslations;
	consentManagerDialog: ConsentManagerDialogTranslations;
	consentTypes: ConsentTypesTranslations;
	consentGate: ConsentGateTranslations;
	legalLinks: LegalLinksTranslations;
	iab: IABTranslations;
	rights: RightsTranslations;
	/**
	 * Optional so custom translation objects keep compiling; English
	 * provides it and fills the gaps for every other language.
	 */
	optOut?: OptOutTranslations;
	/**
	 * Optional so custom translation objects keep compiling; English
	 * provides it and fills the gaps for every other language.
	 */
	trigger?: TriggerTranslations;
	/**
	 * Optional so custom translation objects and other languages keep
	 * compiling; English provides it and fills the gaps for every other
	 * language.
	 */
	privacyChoices?: PrivacyChoicesTranslations;
}

// Partial translations interface (used for other languages)
export interface Translations {
	common: Partial<CommonTranslations>;
	cookieBanner: Partial<CookieBannerTranslations>;
	consentManagerDialog: Partial<ConsentManagerDialogTranslations>;
	consentTypes: {
		[key in AllConsentNames]?: Partial<ConsentTypeTranslations>;
	};
	consentGate?: Partial<ConsentGateTranslations>;
	/**
	 * `consentGate` copy under its name before the rename. Read as
	 * `consentGate` when that key is absent.
	 *
	 * @deprecated Use `consentGate`.
	 */
	frame?: Partial<ConsentGateTranslations>;
	legalLinks?: Partial<LegalLinksTranslations>;
	iab?: DeepPartial<IABTranslations>;
	optOut?: Partial<OptOutTranslations>;
	privacyChoices?: Partial<PrivacyChoicesTranslations>;
	rights?: Partial<RightsTranslations>;
	trigger?: Partial<TriggerTranslations>;
}

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface TranslationConfig {
	translations: Record<string, Partial<Translations>>;
	defaultLanguage?: string;
	disableAutoLanguageSwitch?: boolean;
}

/**
 * Preferred i18n configuration shape, added in v2.
 *
 * @remarks
 * This maps to the legacy {@link TranslationConfig} as follows:
 * - `messages` -> `translations`
 * - `locale` -> `defaultLanguage`
 * - `detectBrowserLanguage` -> inverse of `disableAutoLanguageSwitch`
 *
 * Edge cases:
 * - If `messages` is empty, English defaults are still injected by merge helpers.
 * - If `locale` is undefined, language resolution falls back to browser detection,
 *   then to `'en'`.
 * - If `detectBrowserLanguage` is undefined, browser detection remains enabled.
 *
 * @example
 * ```ts
 * const i18n = {
 *   locale: 'en',
 *   detectBrowserLanguage: false,
 *   messages: {
 *     en: { common: { acceptAll: 'Accept all' } },
 *     de: { common: { acceptAll: 'Alle akzeptieren' } },
 *   },
 * };
 * ```
 *
 * @see {@link TranslationConfig}
 * @see {@link Translations}
 */
export interface I18nConfig {
	/**
	 * Translation message map keyed by language code (`en`, `de`, `fr`, ...).
	 */
	messages: Record<string, Partial<Translations>>;
	/**
	 * Preferred language code used as the initial fallback locale.
	 */
	locale?: string;
	/**
	 * Whether to auto-detect from browser language settings.
	 *
	 * @remarks
	 * This is the inverse of legacy `disableAutoLanguageSwitch`.
	 */
	detectBrowserLanguage?: boolean;
}

/**
 * Input shape accepted by translation helpers in both legacy and v2 formats.
 *
 * @remarks
 * This interface accepts:
 * - legacy `TranslationConfig` fields (`translations`, `defaultLanguage`,
 *   `disableAutoLanguageSwitch`)
 * - v2 `i18n` fields (`messages`, `locale`, `detectBrowserLanguage`)
 *
 * Prefer supplying `i18n` for new code and keep legacy fields only for
 * compatibility during migration.
 *
 * @example
 * ```ts
 * const legacyInput = {
 *   translations: { en: { common: { acceptAll: 'Accept all' } } },
 *   defaultLanguage: 'en',
 * };
 *
 * const v2Input = {
 *   i18n: {
 *     locale: 'de',
 *     messages: { de: { common: { acceptAll: 'Alle akzeptieren' } } },
 *   },
 * };
 * ```
 *
 * @see {@link TranslationConfig}
 * @see {@link I18nConfig}
 */
export interface TranslationInputConfig extends Partial<TranslationConfig> {
	i18n?: Partial<I18nConfig>;
}
