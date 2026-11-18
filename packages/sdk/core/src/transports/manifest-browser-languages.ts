/**
 * Base copy for every language but English, one `import()` each. The
 * browser manifest resolver loads this module only when a visitor resolves
 * to another language, so first-load JavaScript carries a single `import()`
 * instead of one per language.
 *
 * @internal
 */
import type { Translations } from '@inth/sdk-translations';

import type { OtherLanguage } from './manifest-browser-resolve';

type LanguageModule = Promise<{ translations: Translations }>;

/**
 * One `import()` per language, each with a literal specifier, so a bundler
 * splits every language into a chunk of its own. The record type makes a
 * language added to `@inth/sdk/translations` a type error here until it is
 * listed.
 */
const languageModules: Record<OtherLanguage, () => LanguageModule> = {
	ar: () => import('@inth/sdk-translations/ar'),
	bg: () => import('@inth/sdk-translations/bg'),
	bn: () => import('@inth/sdk-translations/bn'),
	cs: () => import('@inth/sdk-translations/cs'),
	cy: () => import('@inth/sdk-translations/cy'),
	da: () => import('@inth/sdk-translations/da'),
	de: () => import('@inth/sdk-translations/de'),
	el: () => import('@inth/sdk-translations/el'),
	es: () => import('@inth/sdk-translations/es'),
	et: () => import('@inth/sdk-translations/et'),
	fi: () => import('@inth/sdk-translations/fi'),
	fr: () => import('@inth/sdk-translations/fr'),
	ga: () => import('@inth/sdk-translations/ga'),
	gu: () => import('@inth/sdk-translations/gu'),
	he: () => import('@inth/sdk-translations/he'),
	hi: () => import('@inth/sdk-translations/hi'),
	hr: () => import('@inth/sdk-translations/hr'),
	ht: () => import('@inth/sdk-translations/ht'),
	hu: () => import('@inth/sdk-translations/hu'),
	id: () => import('@inth/sdk-translations/id'),
	is: () => import('@inth/sdk-translations/is'),
	it: () => import('@inth/sdk-translations/it'),
	ja: () => import('@inth/sdk-translations/ja'),
	kn: () => import('@inth/sdk-translations/kn'),
	ko: () => import('@inth/sdk-translations/ko'),
	lb: () => import('@inth/sdk-translations/lb'),
	lt: () => import('@inth/sdk-translations/lt'),
	lv: () => import('@inth/sdk-translations/lv'),
	ml: () => import('@inth/sdk-translations/ml'),
	mr: () => import('@inth/sdk-translations/mr'),
	ms: () => import('@inth/sdk-translations/ms'),
	mt: () => import('@inth/sdk-translations/mt'),
	nb: () => import('@inth/sdk-translations/nb'),
	nl: () => import('@inth/sdk-translations/nl'),
	nn: () => import('@inth/sdk-translations/nn'),
	pa: () => import('@inth/sdk-translations/pa'),
	pl: () => import('@inth/sdk-translations/pl'),
	pt: () => import('@inth/sdk-translations/pt'),
	rm: () => import('@inth/sdk-translations/rm'),
	ro: () => import('@inth/sdk-translations/ro'),
	ru: () => import('@inth/sdk-translations/ru'),
	sk: () => import('@inth/sdk-translations/sk'),
	sl: () => import('@inth/sdk-translations/sl'),
	sv: () => import('@inth/sdk-translations/sv'),
	ta: () => import('@inth/sdk-translations/ta'),
	te: () => import('@inth/sdk-translations/te'),
	th: () => import('@inth/sdk-translations/th'),
	tr: () => import('@inth/sdk-translations/tr'),
	ur: () => import('@inth/sdk-translations/ur'),
	vi: () => import('@inth/sdk-translations/vi'),
	yi: () => import('@inth/sdk-translations/yi'),
	zh: () => import('@inth/sdk-translations/zh'),
};

const loading = new Map<string, Promise<Translations | undefined>>();

/**
 * Load one language's base copy, once per page.
 *
 * @param language - A language other than English.
 * @returns The language's copy, or `undefined` when its chunk fails to
 * load. A later call tries again.
 * @internal
 */
export const loadLanguageCopy = function loadLanguageCopy(
	language: OtherLanguage
): Promise<Translations | undefined> {
	let pending = loading.get(language);
	if (!pending) {
		pending = (async () => {
			try {
				const { translations } = await languageModules[language]();
				return translations;
			} catch {
				loading.delete(language);
				return undefined;
			}
		})();
		loading.set(language, pending);
	}
	return pending;
};
