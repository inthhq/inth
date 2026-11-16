/**
 * The English copy the stock surfaces fall back to.
 *
 * It ships with the first load, from `@c15t/translations/en`, so a surface
 * renders its copy on its first render even before the consent engine's
 * chunk has loaded. The owned runtime also registers core's
 * `defaultTranslationConfig` under a global key when it is created
 * (`owned-runtime.ts`), the same way the Svelte adapter does; that one
 * wins once it exists.
 *
 * @packageDocumentation
 * @internal
 */

import type { TranslationConfig } from '@c15t/core';
import { translations as english } from '@c15t/translations/en';

/** Global key the owned runtime registers the defaults under. @internal */
export const DEFAULT_TRANSLATIONS_KEY = Symbol.for(
	'c15t.angular.defaultTranslations'
);

/**
 * The English copy every surface falls back to: the same config as core's
 * `defaultTranslationConfig`, without core's root entry.
 */
export const defaultTranslationConfig: TranslationConfig = {
	defaultLanguage: 'en',
	disableAutoLanguageSwitch: false,
	translations: { en: english },
};

/**
 * The default copy: the defaults a runtime registered, else English.
 *
 * @returns A config whose `translations.en` is a complete bundle.
 * @internal
 */
export const registeredDefaultTranslations =
	function registeredDefaultTranslations(): TranslationConfig {
		return (
			(globalThis as Record<symbol, TranslationConfig | undefined>)[
				DEFAULT_TRANSLATIONS_KEY
			] ?? defaultTranslationConfig
		);
	};

/**
 * The defaults the surfaces resolve their copy against.
 *
 * @param _config - `ConsentManager.translationConfig()`. Kept for callers;
 * the defaults no longer depend on it.
 * @returns A config whose `translations.en` is a complete bundle.
 */
export const fallbackTranslations = function fallbackTranslations(
	_config: TranslationConfig
): TranslationConfig {
	return registeredDefaultTranslations();
};
