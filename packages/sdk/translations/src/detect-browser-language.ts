/**
 * The language to show: the browser's, when the translations have it and
 * auto switching is on, else `defaultLanguage`, else English.
 */
export const detectBrowserLanguage = function detectBrowserLanguage(
	translations: Record<string, unknown>,
	defaultLanguage: string | undefined,
	disableAutoSwitch = false
): string {
	if (disableAutoSwitch) {
		return defaultLanguage || 'en';
	}

	if (typeof window === 'undefined') {
		return defaultLanguage || 'en';
	}

	const browserLang = window.navigator.language?.split('-')[0] || '';
	return browserLang && browserLang in translations
		? browserLang
		: defaultLanguage || 'en';
};
