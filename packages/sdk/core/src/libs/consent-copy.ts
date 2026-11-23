/** Resolve the copy a consent UI renders from the active translations. */
import type {
	OptOutRight,
	PolicyPrompt,
	PolicyRight,
} from '@inth/sdk-schema/types';
import type {
	CompleteTranslations,
	IABTranslations,
	OptOutTranslations,
	PrivacyChoicesTranslations,
	Translations,
	TriggerTranslations,
	VendorListTranslations,
} from '@inth/sdk-translations';
// The `/en` entry, not the package root: the React components that share a
// chunk with lazy surfaces call these helpers, and importing the root (with
// its stock-language registry) from that chunk gives Rolldown a static cycle
// that splits every shared module into its own file.
import { translations as enTranslations } from '@inth/sdk-translations/en';

import type { PresentationAction } from './policy-actions';

/** Rights a surface exposes as a control. `disclosure` is carried by legal links. */
export type PreferenceControl = Exclude<PolicyRight, 'disclosure'>;

/**
 * Form of the opt-out link under CCPA regulations (sections 7015 and 7026).
 *
 * - `'do-not-sell'`: "Do Not Sell or Share My Personal Information" with no icon.
 * - `'privacy-choices'`: "Your Privacy Choices" paired with the CPPA opt-out icon.
 * - `'california-privacy-choices'`: "Your California Privacy Choices" paired with
 *   the CPPA opt-out icon.
 */
export type OptOutLinkVariant =
	| 'do-not-sell'
	| 'privacy-choices'
	| 'california-privacy-choices';

/** Icon marker for the California Privacy Protection Agency opt-out icon. */
export type OptOutLinkIcon = 'cppa-opt-out';

/**
 * Opt-out link presentation returned by {@link resolveOptOutLink}.
 *
 * The `'privacy-choices'` member always carries `icon: 'cppa-opt-out'` so
 * neither "Privacy Choices" title renders without the mandated icon.
 */
export type ResolvedOptOutLink =
	| { variant: 'do-not-sell'; label: string }
	| { variant: 'privacy-choices'; label: string; icon: OptOutLinkIcon };

/** Banner heading and body text under the active policy prompt. */
export interface PromptCopy {
	title: string;
	description: string;
}

/**
 * Banner title and description for a policy prompt.
 *
 * @remarks
 * A notice prompt reads `noticeTitle` and `noticeDescription` so it informs
 * rather than asks. A language that has not translated the notice copy falls
 * back to its own choice copy before English.
 *
 * @param translations - The active language bundle. Missing keys use English.
 * @returns The title and description to render.
 *
 * @example
 * ```ts
 * const { title, description } = resolvePromptCopy(translations, rule.prompt);
 * ```
 */
export const resolvePromptCopy = function resolvePromptCopy(
	translations: Partial<Translations> | undefined,
	prompt: PolicyPrompt
): PromptCopy {
	const banner = translations?.cookieBanner;
	const fallback = enTranslations.cookieBanner;
	if (prompt === 'notice') {
		return {
			description:
				banner?.noticeDescription ??
				banner?.description ??
				fallback.noticeDescription,
			title: banner?.noticeTitle ?? banner?.title ?? fallback.noticeTitle,
		};
	}
	return {
		description: banner?.description ?? fallback.description,
		title: banner?.title ?? fallback.title,
	};
};

/**
 * Button labels for every presentation action.
 *
 * @remarks
 * Pairs with `actionGroups` from `resolveConsentPresentation`, so a custom
 * UI can render any resolved action without its own label map. `dismiss`
 * reads `common.acknowledge`, then `common.dismiss`.
 *
 * @param translations - The active language bundle. Missing keys use English.
 *
 * @example
 * ```ts
 * const labels = resolveActionLabels(translations);
 * presentation.orderedActions.map((action) => labels[action]);
 * ```
 */
export const resolveActionLabels = function resolveActionLabels(
	translations: Partial<Translations> | undefined
): Record<PresentationAction, string> {
	const common = translations?.common;
	const fallback = enTranslations.common;
	return {
		accept: common?.acceptAll ?? fallback.acceptAll,
		customize: common?.customize ?? fallback.customize,
		dismiss: common?.acknowledge ?? common?.dismiss ?? fallback.acknowledge,
		reject: common?.rejectAll ?? fallback.rejectAll,
		save: common?.save ?? fallback.save,
	};
};

/**
 * Labels for the controls that open preferences.
 *
 * @remarks
 * Pairs with `preferenceControls` from `resolveConsentPresentation`. The
 * `opt-out` label keeps its statutory "do not sell or share" meaning, so
 * translate it rather than reusing the preferences label.
 *
 * @param translations - The active language bundle. Missing keys use English.
 *
 * @example
 * ```ts
 * const labels = resolvePreferenceControlLabels(translations);
 * presentation.preferenceControls.map((control) => labels[control]);
 * ```
 */
export const resolvePreferenceControlLabels =
	function resolvePreferenceControlLabels(
		translations: Partial<Translations> | undefined
	): Record<PreferenceControl, string> {
		const rights = translations?.rights;
		const fallback = enTranslations.rights;
		return {
			'opt-out': rights?.optOut ?? fallback.optOut,
			preferences: rights?.preferences ?? fallback.preferences,
		};
	};

/**
 * Presentation of the opt-out link for the active translations and chosen form.
 *
 * @remarks
 * `'do-not-sell'` returns the standard "Do Not Sell or Share My Personal
 * Information" title with no icon. `'privacy-choices'` ("Your Privacy Choices")
 * and `'california-privacy-choices'` ("Your California Privacy Choices") both
 * return `variant: 'privacy-choices'` with `icon: 'cppa-opt-out'`.
 *
 * @param translations - The active language bundle. Missing keys use English.
 * @param variant - Opt-out link form. Defaults to `'do-not-sell'`.
 * @returns The resolved opt-out link presentation.
 *
 * @example
 * ```ts
 * const link = resolveOptOutLink(translations, 'privacy-choices');
 * // { variant: 'privacy-choices', label: 'Your Privacy Choices', icon: 'cppa-opt-out' }
 * ```
 */
export const resolveOptOutLink = function resolveOptOutLink(
	translations: Partial<Translations> | undefined,
	variant: OptOutLinkVariant = 'do-not-sell'
): ResolvedOptOutLink {
	const rights = translations?.rights;
	const fallback = enTranslations.rights;
	if (variant === 'privacy-choices') {
		return {
			icon: 'cppa-opt-out',
			label: rights?.privacyChoices ?? fallback.privacyChoices,
			variant: 'privacy-choices',
		};
	}
	if (variant === 'california-privacy-choices') {
		return {
			icon: 'cppa-opt-out',
			label:
				rights?.californiaPrivacyChoices ?? fallback.californiaPrivacyChoices,
			variant: 'privacy-choices',
		};
	}
	return {
		label: rights?.optOut ?? fallback.optOut,
		variant: 'do-not-sell',
	};
};

/**
 * Display title of a consent category.
 *
 * @remarks
 * Reads the active language, then English, then title-cases the name, so a
 * custom category without a translation still reads as words
 * (`product_updates` becomes "Product Updates").
 *
 * @example
 * ```ts
 * resolveCategoryTitle(translations, 'measurement'); // 'Analytics'
 * ```
 */
export const resolveCategoryTitle = function resolveCategoryTitle(
	translations: Partial<Translations> | undefined,
	name: string
): string {
	const own = translations?.consentTypes as
		| Record<string, { title?: string } | undefined>
		| undefined;
	const english = enTranslations.consentTypes as Record<
		string,
		{ title?: string } | undefined
	>;
	return (
		own?.[name]?.title ??
		english[name]?.title ??
		name
			.replace(/_/gu, ' ')
			.replace(/\b\w/gu, (character) => character.toUpperCase())
	);
};

const isSection = function isSection(
	value: unknown
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** `overrides` over `defaults`, key by key, keeping the shape of `defaults`. */
const mergeOver = function mergeOver<Section extends object>(
	defaults: Section,
	overrides: unknown
): Section {
	if (!isSection(overrides)) {
		return defaults;
	}
	const result: Record<string, unknown> = { ...(defaults as object) };
	for (const [key, fallback] of Object.entries(defaults)) {
		const value = overrides[key];
		if (value === undefined) {
			continue;
		}
		result[key] =
			isSection(fallback) && isSection(value)
				? mergeOver(fallback, value)
				: value;
	}
	return result as Section;
};

type Filled<Section> = {
	[Key in keyof Section]-?: NonNullable<Section[Key]> extends object
		? Filled<NonNullable<Section[Key]>>
		: NonNullable<Section[Key]>;
};

/** The IAB copy with every key set, including the ones a language may omit. */
export type ResolvedIABCopy = Filled<IABTranslations>;

/**
 * The IAB copy, every key filled.
 *
 * @remarks
 * Language bundles and backend copy may leave IAB keys out; each missing
 * key reads English.
 *
 * @returns The complete IAB copy.
 *
 * @example
 * ```ts
 * const iab = resolveIABCopy(translations);
 * iab.preferenceCenter.vendorList.search;
 * ```
 */
export const resolveIABCopy = function resolveIABCopy(
	translations: Partial<Translations> | undefined
): ResolvedIABCopy {
	// English sets every key, so the merge leaves none unset.
	return mergeOver(enTranslations.iab as ResolvedIABCopy, translations?.iab);
};

/**
 * Copy for the opt-out confirmation view and opt-out notices in preferences.
 *
 * @param translations - The active language bundle. Missing keys use English.
 * @returns The opt-out status, confirmation and lock-reason copy.
 */
export const resolveOptOutCopy = function resolveOptOutCopy(
	translations: Partial<Translations> | undefined
): OptOutTranslations {
	// English always carries the section.
	return mergeOver(
		enTranslations.optOut as OptOutTranslations,
		translations?.optOut
	);
};

/**
 * The three rights bundles the sale row can control: sale, sharing and
 * targeted ads (`all`), sale and sharing (`sale-share`), or sale and
 * targeted ads (`sale-ads`).
 */
export type RightsBundle = 'all' | 'sale-share' | 'sale-ads';

/**
 * The bundle a set of opt-out rights forms.
 *
 * @returns The bundle, or `null` for an empty set (rights not confirmed
 * yet) and for any set that is not one of the three bundles.
 *
 * @example
 * ```ts
 * resolveRightsBundle(['sale', 'share']); // 'sale-share'
 * ```
 */
export const resolveRightsBundle = function resolveRightsBundle(
	rights: readonly OptOutRight[]
): RightsBundle | null {
	const unique = new Set(rights);
	if (!unique.has('sale')) {
		return null;
	}
	const hasShare = unique.has('share');
	const hasTargetedAds = unique.has('targeted_ads');
	if (unique.size === 3 && hasShare && hasTargetedAds) {
		return 'all';
	}
	if (unique.size === 2 && hasShare) {
		return 'sale-share';
	}
	if (unique.size === 2 && hasTargetedAds) {
		return 'sale-ads';
	}
	return null;
};

const rightsPhraseFor = function rightsPhraseFor(
	copy: OptOutTranslations,
	rights: readonly OptOutRight[]
): string | null {
	const combo = resolveRightsBundle(rights);
	if (combo === 'all') {
		return copy.rightsAll;
	}
	if (combo === 'sale-share') {
		return copy.rightsSaleAndShare;
	}
	if (combo === 'sale-ads') {
		return copy.rightsSaleAndTargetedAds;
	}
	return null;
};

/**
 * Resolve the heading for the sale-and-sharing block in the preference dialog.
 *
 * Names confirmed rights only for the three standard combinations (sale+share,
 * sale+targeted_ads, all three). Any other set, or unconfirmed rights (which
 * `resolveOptOutReceipt` leaves empty), keeps the configured opt-out link title.
 */
export const resolveOptOutBlockHeading = function resolveOptOutBlockHeading(
	translations: Partial<Translations> | undefined,
	receipt: { readonly rights: readonly OptOutRight[] },
	variant: OptOutLinkVariant = 'do-not-sell'
): string {
	const copy = resolveOptOutCopy(translations);
	const combo = resolveRightsBundle(receipt.rights);
	if (combo === 'all') {
		return copy.headingAll;
	}
	if (combo === 'sale-share') {
		return copy.headingSaleAndShare;
	}
	if (combo === 'sale-ads') {
		return copy.headingSaleAndTargetedAds;
	}
	return resolveOptOutLink(translations, variant).label;
};

/**
 * Resolve the body sentence for the two-step opt-in confirmation dialog.
 *
 * Names confirmed rights only for the three standard combinations (sale+share,
 * sale+targeted_ads, all three). Any other set, or unconfirmed rights (which
 * `resolveOptOutReceipt` leaves empty), uses the neutral sentence.
 */
export const resolveOptInConfirmationSentence =
	function resolveOptInConfirmationSentence(
		translations: Partial<Translations> | undefined,
		receipt: { readonly rights: readonly OptOutRight[] }
	): string {
		const copy = resolveOptOutCopy(translations);
		const phrase = rightsPhraseFor(copy, receipt.rights);
		if (phrase !== null) {
			return copy.optInDescriptionWithRights.replace('{rights}', phrase);
		}
		return copy.optInDescription;
	};

/**
 * Resolve the receipt sentence for an opt-out confirmation view.
 *
 * Names confirmed rights only for the three standard combinations (sale+share,
 * sale+targeted_ads, all three). Any other set of rights uses the neutral
 * sentence for the active scope.
 */
export const resolveOptOutReceiptSentence =
	function resolveOptOutReceiptSentence(
		translations: Partial<Translations> | undefined,
		receipt: {
			readonly rights: readonly OptOutRight[];
			readonly scope: 'browser' | 'account' | null;
		}
	): string {
		const copy = resolveOptOutCopy(translations);
		const phrase = rightsPhraseFor(copy, receipt.rights);
		if (phrase !== null) {
			const template =
				receipt.scope === 'account'
					? copy.receiptAccountWithRights
					: copy.receiptBrowserWithRights;
			return template.replace('{rights}', phrase);
		}
		return receipt.scope === 'account'
			? copy.receiptAccount
			: copy.receiptBrowser;
	};

/**
 * Copy for the Privacy Choices surfaces, every key filled.
 *
 * @remarks
 * Most of these strings take placeholders; read them through the builders
 * below ({@link scopePhrase}, {@link resolveRightsPhrases},
 * {@link resolveOptInPromptCopy} and the rest) so each sentence names the
 * configured rights bundle (COPY-01).
 *
 * @param translations - The active language bundle. Missing keys use English.
 */
export const resolvePrivacyChoicesCopy = function resolvePrivacyChoicesCopy(
	translations: Partial<Translations> | undefined
): PrivacyChoicesTranslations {
	// English always carries the section.
	return mergeOver(
		enTranslations.privacyChoices as PrivacyChoicesTranslations,
		translations?.privacyChoices
	);
};

/** Who the visitor is and which site they are on, for the sentences below. */
export interface PrivacyChoicesSubject {
	/**
	 * The site's name, for `{business}`. Without one the copy says "this
	 * site" (`businessFallback`), or drops the name where it would not read.
	 */
	business?: string;
	/** Whether the visitor is signed in, so a choice also reaches the account. */
	signedIn?: boolean;
}

/** Every `{name}` in `template` replaced by `values[name]`; unknown ones stay. */
const fill = function fill(
	template: string,
	values: Readonly<Partial<Record<string, string>>>
): string {
	// One pass, so a value that itself contains `{rights}` (a site name, say)
	// is never filled a second time.
	// Own keys only: `{constructor}` must not read `Object.prototype`.
	return template.replace(/\{[a-z]+\}/gu, (match) => {
		const key = match.slice(1, -1);
		return (Object.hasOwn(values, key) ? values[key] : undefined) ?? match;
	});
};

/**
 * `{business}` for a sentence: the site's name as written, or the fallback,
 * capitalised when it opens the sentence. A real name is never recased.
 */
const businessFor = function businessFor(
	copy: PrivacyChoicesTranslations,
	template: string,
	business: string | undefined
): string {
	const name = business?.trim();
	if (name) {
		return name;
	}
	const fallback = copy.businessFallback;
	return template.startsWith('{business}')
		? fallback.charAt(0).toLocaleUpperCase() + fallback.slice(1)
		: fallback;
};

/** The four phrases one rights bundle reads as. */
export interface RightsPhrases {
	/** What the visitor is asked to allow: "sell or share your personal information". */
	ask: string;
	/** What the site will not do: "won't sell or share your personal information". */
	refuse: string;
	/** Short form for the one-line opt-in banner: "selling or sharing your data". */
	short: string;
	/** The rights as a sentence subject: "Selling and sharing". */
	title: string;
}

/**
 * The phrases for one rights bundle, so no sentence hard-codes "selling and
 * sharing" (COPY-01).
 *
 * @example
 * ```ts
 * resolveRightsPhrases(translations, 'sale-ads').short;
 * // 'selling your data or using it for ads'
 * ```
 */
export const resolveRightsPhrases = function resolveRightsPhrases(
	translations: Partial<Translations> | undefined,
	bundle: RightsBundle
): RightsPhrases {
	const copy = resolvePrivacyChoicesCopy(translations);
	if (bundle === 'sale-share') {
		return {
			ask: copy.askSaleAndShare,
			refuse: copy.refuseSaleAndShare,
			short: copy.shortSaleAndShare,
			title: copy.titleSaleAndShare,
		};
	}
	if (bundle === 'sale-ads') {
		return {
			ask: copy.askSaleAndTargetedAds,
			refuse: copy.refuseSaleAndTargetedAds,
			short: copy.shortSaleAndTargetedAds,
			title: copy.titleSaleAndTargetedAds,
		};
	}
	return {
		ask: copy.askAll,
		refuse: copy.refuseAll,
		short: copy.shortAll,
		title: copy.titleAll,
	};
};

/**
 * Where a rights choice applies: "on this browser", or, signed in, "on this
 * browser or for your Acme account".
 */
export const scopePhrase = function scopePhrase(
	translations: Partial<Translations> | undefined,
	subject: PrivacyChoicesSubject = {}
): string {
	const copy = resolvePrivacyChoicesCopy(translations);
	if (!subject.signedIn) {
		return copy.scopeBrowser;
	}
	const business = subject.business?.trim();
	return business
		? fill(copy.scopeAccount, { business })
		: copy.scopeAccountUnnamed;
};

/** The US opt-in prompt's title, card body and one-line banner text. */
export interface OptInPromptCopy {
	title: string;
	description: string;
	barDescription: string;
}

/**
 * The US opt-in prompt's copy for a rights bundle.
 *
 * @example
 * ```ts
 * resolveOptInPromptCopy(translations, { bundle: 'all', business: 'Acme' })
 * 	.barDescription;
 * // 'Acme asks before using optional cookies or selling or sharing your data for ads.'
 * ```
 */
export const resolveOptInPromptCopy = function resolveOptInPromptCopy(
	translations: Partial<Translations> | undefined,
	input: PrivacyChoicesSubject & { bundle: RightsBundle }
): OptInPromptCopy {
	const copy = resolvePrivacyChoicesCopy(translations);
	const phrases = resolveRightsPhrases(translations, input.bundle);
	return {
		barDescription: fill(copy.optInBarDescription, {
			business: businessFor(copy, copy.optInBarDescription, input.business),
			rights: phrases.short,
		}),
		description: fill(copy.optInDescription, {
			business: businessFor(copy, copy.optInDescription, input.business),
			rights: phrases.ask,
		}),
		title: copy.optInTitle,
	};
};

/**
 * The one-line US notice banner text. While a Global Privacy Control signal
 * is honored it drops the ads clause and says the signal is honored
 * (GPC-08).
 */
export const resolveNoticeBarDescription = function resolveNoticeBarDescription(
	translations: Partial<Translations> | undefined,
	gpcHonored: boolean
): string {
	const copy = resolvePrivacyChoicesCopy(translations);
	return gpcHonored ? copy.noticeBarDescriptionGpc : copy.noticeBarDescription;
};

/**
 * The note that replaces the sale row's description while a Global Privacy
 * Control signal is on (GPC-04). It says what the site won't do and where,
 * and never tells the visitor to turn the signal off.
 *
 * @example
 * ```ts
 * resolveGpcNote(translations, { bundle: 'sale-share', business: 'Acme' });
 * // "Your browser sent a Global Privacy Control signal, so Acme won't sell or
 * // share your personal information on this browser. Allow isn't available
 * // while the signal is on."
 * ```
 */
export const resolveGpcNote = function resolveGpcNote(
	translations: Partial<Translations> | undefined,
	input: PrivacyChoicesSubject & { bundle: RightsBundle }
): string {
	const copy = resolvePrivacyChoicesCopy(translations);
	return fill(copy.gpcNote, {
		business: businessFor(copy, copy.gpcNote, input.business),
		rights: resolveRightsPhrases(translations, input.bundle).refuse,
		scope: scopePhrase(translations, input),
	});
};

/**
 * The announcement after Allow on a banner while the sale choice stays off,
 * naming the rights and, under a live signal, why.
 */
export const resolveBannerAllowedAnnouncement =
	function resolveBannerAllowedAnnouncement(
		translations: Partial<Translations> | undefined,
		input: { bundle: RightsBundle; gpc: boolean }
	): string {
		const copy = resolvePrivacyChoicesCopy(translations);
		return fill(
			input.gpc ? copy.bannerAllowedRightsOffGpc : copy.bannerAllowedRightsOff,
			{ rights: resolveRightsPhrases(translations, input.bundle).title }
		);
	};

/** The receipt line that says where a recorded choice applies. */
export const resolveReceiptScope = function resolveReceiptScope(
	translations: Partial<Translations> | undefined,
	subject: PrivacyChoicesSubject = {}
): string {
	const copy = resolvePrivacyChoicesCopy(translations);
	if (!subject.signedIn) {
		return copy.receiptScopeBrowser;
	}
	const business = subject.business?.trim();
	return business
		? fill(copy.receiptScopeAccount, { business })
		: copy.receiptScopeAccountUnnamed;
};

/** The cookie-category row: its title, what it covers, and how many are on. */
export interface PreferencesRowCopy {
	title: string;
	summary: string;
	onCount: string;
	/** Accessible name of the button that closes its sheet. */
	close: string;
}

/**
 * The "Preferences" row's copy (COPY-05). The row joins the parts with a
 * separator: "Preferences · Site features and analytics · 2 on".
 */
export const resolvePreferencesRowCopy = function resolvePreferencesRowCopy(
	translations: Partial<Translations> | undefined,
	onCount: number
): PreferencesRowCopy {
	const copy = resolvePrivacyChoicesCopy(translations);
	return {
		close: copy.preferencesClose,
		onCount: fill(copy.preferencesOnCount, { count: String(onCount) }),
		summary: copy.preferencesSummary,
		title: copy.preferencesTitle,
	};
};

/**
 * Accessible names for the floating trigger and its toolbar.
 *
 * @param translations - The active language bundle. Missing keys use English.
 * @returns The trigger, toolbar and DevTools item labels.
 *
 * @example
 * ```ts
 * button.ariaLabel = resolveTriggerLabels(translations).label;
 * ```
 */
export const resolveTriggerLabels = function resolveTriggerLabels(
	translations: Partial<Translations> | undefined
): TriggerTranslations {
	// English always carries the section.
	return mergeOver(
		enTranslations.trigger as TriggerTranslations,
		translations?.trigger
	);
};

/**
 * Copy for the vendor rows under a category, every key filled.
 *
 * @param translations - The active language bundle. Missing keys use English.
 *
 * @example
 * ```ts
 * resolveVendorListCopy(translations).title.replace('{count}', '3');
 * ```
 */
export const resolveVendorListCopy = function resolveVendorListCopy(
	translations: Partial<Translations> | undefined
): VendorListTranslations {
	// English always carries the section.
	return mergeOver(
		enTranslations.consentManagerDialog.vendors as VendorListTranslations,
		translations?.consentManagerDialog?.vendors
	);
};

/** `overrides` over `defaults`, keeping keys only `overrides` has. */
const mergeAll = function mergeAll(
	defaults: Record<string, unknown>,
	overrides: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...defaults };
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) {
			continue;
		}
		const fallback = result[key];
		result[key] =
			isSection(fallback) && isSection(value)
				? mergeAll(fallback, value)
				: value;
	}
	return result;
};

const resolvedBundles = new WeakMap<object, CompleteTranslations>();

/**
 * The copy a consent surface renders: the active language bundle with
 * English filling every key it leaves out, so a partial backend bundle
 * renders the same in every framework.
 *
 * @remarks
 * Reads the legacy `frame` section as `consentGate`, and an older bundle's
 * `common.dismiss` as `common.acknowledge`, as `deepMergeTranslations`
 * does. A bundle without notice copy keeps its own choice copy for the
 * notice, as `resolvePromptCopy` reads it. The result is cached per bundle.
 *
 * @param snapshot - A consent snapshot, or anything carrying its
 * `translations`.
 * @returns The complete translations.
 *
 * @example
 * ```ts
 * const t = resolveSurfaceTranslations(kernel.getSnapshot());
 * t.cookieBanner.title;
 * ```
 */
export const resolveSurfaceTranslations = function resolveSurfaceTranslations(
	snapshot:
		| { translations?: { translations?: unknown } | null }
		| null
		| undefined
): CompleteTranslations {
	const bundle = snapshot?.translations?.translations;
	const english = enTranslations as CompleteTranslations;
	if (!isSection(bundle)) {
		return english;
	}
	const cached = resolvedBundles.get(bundle);
	if (cached) {
		return cached;
	}
	const { frame, ...current } = bundle;
	if (isSection(frame)) {
		current.consentGate = isSection(current.consentGate)
			? { ...frame, ...current.consentGate }
			: frame;
	}
	const merged = mergeAll(
		english as unknown as Record<string, unknown>,
		current
	) as unknown as CompleteTranslations;
	const common = isSection(current.common) ? current.common : {};
	if (common.acknowledge === undefined && typeof common.dismiss === 'string') {
		merged.common = { ...merged.common, acknowledge: common.dismiss };
	}
	// A language without notice copy reads its own choice copy before
	// English, as `resolvePromptCopy` does.
	const banner = isSection(current.cookieBanner) ? current.cookieBanner : {};
	merged.cookieBanner = {
		...merged.cookieBanner,
		noticeDescription: (banner.noticeDescription ??
			banner.description ??
			merged.cookieBanner.noticeDescription) as string,
		noticeTitle: (banner.noticeTitle ??
			banner.title ??
			merged.cookieBanner.noticeTitle) as string,
	};
	resolvedBundles.set(bundle, merged);
	return merged;
};
