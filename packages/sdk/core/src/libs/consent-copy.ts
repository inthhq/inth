/** Resolve the copy a consent UI renders from the active translations. */
import type { PolicyPrompt, PolicyRight } from '@inth/sdk-schema/types';
import type {
	IABTranslations,
	Translations,
	TriggerTranslations,
} from '@inth/sdk-translations';
// The `/en` entry, not the package root: the React components that share a
// chunk with lazy surfaces call these helpers, and importing the root (with
// its stock-language registry) from that chunk gives Rolldown a static cycle
// that splits every shared module into its own file.
import { translations as enTranslations } from '@inth/sdk-translations/en';

import type { PresentationAction } from './policy-actions';

/** Rights a surface exposes as a control. `disclosure` is carried by legal links. */
export type PreferenceControl = Exclude<PolicyRight, 'disclosure'>;

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
