import type { TranslationConfig } from '@c15t/core';
import { translations as english } from '@c15t/translations/en';
import { resolveTranslations } from '@c15t/ui/utils';

/**
 * IAB translations interface.
 * Matches the structure in @c15t/translations.
 */
export interface IABTranslations {
	banner: {
		title: string;
		description: string;
		partnersLink: string;
		andMore: string;
		legitimateInterestNotice: string;
		scopeServiceSpecific: string;
		scopeGroup: string;
	};
	common: {
		acceptAll: string;
		rejectAll: string;
		customize: string;
		saveSettings: string;
		loading: string;
		showingSelectedVendor: string;
		clearSelection: string;
		customPartner: string;
	};
	preferenceCenter: {
		title: string;
		description: string;
		tabs: {
			purposes: string;
			vendors: string;
		};
		purposeItem: {
			partners: string;
			vendorsUseLegitimateInterest: string;
			examples: string;
			partnersUsingPurpose: string;
			withYourPermission: string;
			legitimateInterest: string;
			objectButton: string;
			objected: string;
			rightToObject: string;
		};
		specialPurposes: {
			title: string;
			tooltip: string;
		};
		features: {
			title: string;
			description: string;
		};
		vendorList: {
			search: string;
			showingCount: string;
			iabVendorsHeading: string;
			iabVendorsNotice: string;
			customVendorsHeading: string;
			customVendorsNotice: string;
			adTechProvidersHeading: string;
			adTechProvidersNotice: string;
			purposes: string;
			specialPurposes: string;
			specialFeatures: string;
			features: string;
			dataCategories: string;
			usesCookies: string;
			nonCookieAccess: string;
			maxAge: string;
			maxAgeRefreshes: string;
			retention: string;
			retainedDays: string;
			legitimateInterest: string;
			privacyPolicy: string;
			storageDisclosure: string;
			requiredNotice: string;
			noVendorsFound: string;
			partnerCount: string;
			partnerSingular: string;
			partnerPlural: string;
		};
		footer: {
			consentStorage: string;
		};
	};
}

/**
 * The English IAB copy, from `@c15t/translations/en` rather than core's
 * root entry: this module ships with the overlay directives every banner
 * uses, and the root entry would bring the kernel into that first load.
 */
const DEFAULT_IAB_TRANSLATIONS = english.iab as IABTranslations;

/** The English bundle, for `resolveTranslations`. */
const ENGLISH: TranslationConfig = {
	defaultLanguage: 'en',
	disableAutoLanguageSwitch: false,
	translations: { en: english },
};

/**
 * Deep merge helper for IAB translations.
 */
const deepMerge = function deepMerge<T extends Record<string, unknown>>(
	defaults: T,
	overrides?: Partial<T>
): T {
	if (!overrides) {
		return defaults;
	}

	const result = { ...defaults };

	for (const key of Object.keys(defaults) as (keyof T)[]) {
		const defaultValue = defaults[key];
		const overrideValue = overrides[key];

		if (
			overrideValue !== undefined &&
			typeof defaultValue === 'object' &&
			defaultValue !== null &&
			typeof overrideValue === 'object' &&
			overrideValue !== null &&
			!Array.isArray(defaultValue)
		) {
			result[key] = deepMerge(
				defaultValue as Record<string, unknown>,
				overrideValue as Record<string, unknown>
			) as T[keyof T];
		} else if (overrideValue !== undefined) {
			result[key] = overrideValue as T[keyof T];
		}
	}

	return result;
};

/**
 * Get IAB translations with fallback to defaults.
 * Angular equivalent of the React `useIABTranslations` hook.
 */
export const getIABTranslations = function getIABTranslations(
	translationConfig?: TranslationConfig
): IABTranslations {
	const translations = resolveTranslations(translationConfig ?? {}, ENGLISH);
	const defaults = DEFAULT_IAB_TRANSLATIONS;
	if (!translations.iab) {
		return defaults;
	}

	return {
		banner: deepMerge(
			defaults.banner,
			translations.iab.banner as Partial<IABTranslations['banner']>
		),
		common: deepMerge(
			defaults.common,
			translations.iab.common as Partial<IABTranslations['common']>
		),
		preferenceCenter: deepMerge(
			defaults.preferenceCenter,
			translations.iab.preferenceCenter as Partial<
				IABTranslations['preferenceCenter']
			>
		),
	};
};
