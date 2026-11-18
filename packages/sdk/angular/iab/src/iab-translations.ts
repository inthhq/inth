import type { TranslationConfig } from '@inth/sdk/engine';
import {
	defaultTranslationConfig,
	resolveIABCopy,
} from '@inth/sdk/surface-state';
import type { ResolvedIABCopy } from '@inth/sdk/surface-state';
import { resolveTranslations } from '@inth/sdk/ui/utils';

/** The IAB copy with every key set, including the ones a language may omit. */
export type IABTranslations = ResolvedIABCopy;

/**
 * The IAB copy for the active language, every missing key filled from
 * English.
 *
 * @param translationConfig - `ConsentManager.translationConfig()`.
 */
export const getIABTranslations = function getIABTranslations(
	translationConfig?: TranslationConfig
): IABTranslations {
	return resolveIABCopy(
		resolveTranslations(translationConfig ?? {}, defaultTranslationConfig)
	);
};
