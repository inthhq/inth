import type { TranslationConfig } from '@inth/sdk/translations';
import { translations as enTranslations } from '@inth/sdk/translations/en';

export const defaultTranslationConfig = {
	defaultLanguage: 'en',
	translations: {
		en: enTranslations,
	},
} satisfies TranslationConfig;
