import type { TranslationConfig } from '@inth/sdk-translations';
// The `/en` entry, not the package root, so a first-load chunk that reads
// the defaults does not take in the stock-language registry.
import { translations as enTranslations } from '@inth/sdk-translations/en';

/** The English copy every surface falls back to. */
export const defaultTranslationConfig: TranslationConfig = {
	defaultLanguage: 'en',
	disableAutoLanguageSwitch: false,
	translations: {
		en: enTranslations,
	},
};
