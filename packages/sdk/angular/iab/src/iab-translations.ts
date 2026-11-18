import type { TranslationConfig } from '@inth/sdk/engine';
import {
	defaultTranslationConfig,
	resolveIABCopy,
} from '@inth/sdk/surface-state';
import type { IABTranslations } from '@inth/sdk/translations';
import { resolveTranslations } from '@inth/sdk/ui/utils';

export type { IABTranslations } from '@inth/sdk/translations';

/**
 * The IAB copy for the active language, every missing key filled from
 * English.
 *
 * @param translationConfig - `ConsentManager.translationConfig()`.
 * @returns The complete IAB copy.
 */
export const getIABTranslations = function getIABTranslations(
	translationConfig?: TranslationConfig
): IABTranslations {
	return resolveIABCopy(
		resolveTranslations(translationConfig ?? {}, defaultTranslationConfig)
	);
};
