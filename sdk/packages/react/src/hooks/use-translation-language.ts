import { useKernelSelector } from '../kernel-selector';

/**
 * `defaultTranslationConfig.defaultLanguage`, without importing the
 * English bundle that config carries into every chunk that reads it.
 */
const DEFAULT_LANGUAGE = 'en';

/**
 * Language of the active translation bundle.
 *
 * @returns The bundle's language, or the default language before one loads.
 * @internal
 */
export const useTranslationLanguage =
	function useTranslationLanguage(): string {
		return useKernelSelector(
			(snap) => snap.translations?.language ?? DEFAULT_LANGUAGE
		);
	};
