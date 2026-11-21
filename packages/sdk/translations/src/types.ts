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
	/** Status shown when the visitor's own opt-out request is honored. */
	statusRequest: string;
	/** Status shown when a Global Privacy Control signal is honored. */
	statusSignal: string;
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
