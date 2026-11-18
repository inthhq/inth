/**
 * The English copy the stock surfaces fall back to, once the page has it.
 *
 * `ConsentProvider`'s engine, `ConsentRoot`'s engine and the server render
 * register core's `defaultTranslationConfig` under a global key when they
 * create a runtime (`owned-runtime.ts`). Before `ConsentRoot`'s engine
 * loads in the browser there is none: the surfaces read the copy in the
 * snapshot the server rendered with, which the server completed with the
 * English defaults (`deferred/boot-server.ts`). So the page's first-load
 * JavaScript carries no translation bundle.
 *
 * A global key, not a module both sides import: `owned-runtime.ts` must
 * share no module with the first-load graph.
 *
 * @packageDocumentation
 * @internal
 */

import type { TranslationConfig } from '@inth/sdk/engine';

/** Global key the engine registers the defaults under. @internal */
export const DEFAULT_TRANSLATIONS_KEY = Symbol.for(
	'inth.svelte.defaultTranslations'
);

/**
 * The registered defaults, if an engine has been created.
 *
 * @returns core's `defaultTranslationConfig`, or `undefined`.
 * @internal
 */
export const registeredDefaultTranslations =
	function registeredDefaultTranslations(): TranslationConfig | undefined {
		return (globalThis as Record<symbol, TranslationConfig | undefined>)[
			DEFAULT_TRANSLATIONS_KEY
		];
	};

/**
 * The defaults the surfaces resolve their copy against: the registered
 * ones, else the page's own config, whose bundle the server completed.
 *
 * @param config - `consent.state.translationConfig`.
 * @returns A config whose `translations.en` is a complete bundle.
 * @internal
 */
export const fallbackTranslations = function fallbackTranslations(
	config: TranslationConfig
): TranslationConfig {
	const registered = registeredDefaultTranslations();
	if (registered) {
		return registered;
	}
	const own = config.translations[config.defaultLanguage ?? 'en'];
	return own ? { ...config, translations: { en: own } } : config;
};
