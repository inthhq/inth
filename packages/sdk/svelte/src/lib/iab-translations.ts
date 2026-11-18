import type { TranslationConfig } from '@inth/sdk/engine';
import {
	defaultTranslationConfig,
	resolveIABCopy,
} from '@inth/sdk/surface-state';
import type { IABTranslations as IABTranslationKeys } from '@inth/sdk/translations';
import { resolveTranslations } from '@inth/sdk/ui/utils';

type Filled<Section> = {
	[Key in keyof Section]-?: NonNullable<Section[Key]> extends object
		? Filled<NonNullable<Section[Key]>>
		: NonNullable<Section[Key]>;
};

/** The IAB copy with every key set, including the ones a language may omit. */
export type IABTranslations = Filled<IABTranslationKeys>;

/**
 * The IAB copy for the active language, each missing key filled from
 * English.
 *
 * @param translationConfig - `getConsentManager().state.translationConfig`.
 * @returns The complete IAB copy.
 */
export const getIABTranslations = function getIABTranslations(
	translationConfig?: TranslationConfig
): IABTranslations {
	// English sets every key, and `resolveIABCopy` fills each gap from it.
	return resolveIABCopy(
		resolveTranslations(translationConfig ?? {}, defaultTranslationConfig)
	) as IABTranslations;
};
