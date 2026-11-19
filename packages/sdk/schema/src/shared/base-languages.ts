import type { BaseTranslations } from '@inth/sdk-translations';

/**
 * Every language Inth ships base copy for, as primary language subtags.
 * The type check below fails until a language added to the translations
 * package is listed here, and every other list of them derives from this
 * one.
 */
export const BASE_LANGUAGES = [
	'ar',
	'bg',
	'bn',
	'cs',
	'cy',
	'da',
	'de',
	'el',
	'en',
	'es',
	'et',
	'fi',
	'fr',
	'ga',
	'gu',
	'he',
	'hi',
	'hr',
	'ht',
	'hu',
	'id',
	'is',
	'it',
	'ja',
	'kn',
	'ko',
	'lb',
	'lt',
	'lv',
	'ml',
	'mr',
	'ms',
	'mt',
	'nb',
	'nl',
	'nn',
	'pa',
	'pl',
	'pt',
	'rm',
	'ro',
	'ru',
	'sk',
	'sl',
	'sv',
	'ta',
	'te',
	'th',
	'tr',
	'ur',
	'vi',
	'yi',
	'zh',
] as const satisfies readonly (keyof BaseTranslations)[];

/** Fails to compile while a shipped language is missing from the list. */
type EveryLanguageListed<Missing extends never> = Missing;
export type BaseLanguagesListed = EveryLanguageListed<
	Exclude<keyof BaseTranslations, (typeof BASE_LANGUAGES)[number]>
>;
