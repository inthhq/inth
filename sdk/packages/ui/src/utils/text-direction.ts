/**
 * Text direction from a language tag. A module of its own, so a surface
 * that reads only the direction does not load the focus and scroll code.
 */

/**
 * Primary language subtags written right to left by default. `iw` and `ji`
 * are the deprecated codes for Hebrew and Yiddish that some systems still
 * emit. `ku` is absent: it usually means Kurmanji, which uses Latin script.
 * Sorani is `ckb`, and `ku-Arab` resolves through its script subtag.
 */
const RTL_LANGUAGES = new Set([
	'ar',
	'ckb',
	'dv',
	'fa',
	'he',
	'iw',
	'ji',
	'nqo',
	'ps',
	'sd',
	'syr',
	'ug',
	'ur',
	'yi',
]);

/**
 * ISO 15924 script subtags written right to left: the scripts CLDR marks RTL,
 * plus the variant codes it leaves out (`Aran` Nastaliq, the `Syre`, `Syrj`
 * and `Syrn` Syriac forms, and `Phlv` Book Pahlavi). A script subtag
 * overrides the language default, so `ku-Arab` is RTL and `sd-Deva` is LTR.
 */
const RTL_SCRIPTS = new Set([
	'adlm',
	'arab',
	'aran',
	'armi',
	'avst',
	'chrs',
	'cprt',
	'elym',
	'gara',
	'hatr',
	'hebr',
	'hung',
	'khar',
	'lydi',
	'mand',
	'mani',
	'mend',
	'merc',
	'mero',
	'narb',
	'nbat',
	'nkoo',
	'orkh',
	'ougr',
	'palm',
	'phli',
	'phlp',
	'phlv',
	'phnx',
	'prti',
	'rohg',
	'samr',
	'sarb',
	'sidt',
	'sogd',
	'sogo',
	'syrc',
	'syre',
	'syrj',
	'syrn',
	'thaa',
	'yezi',
]);

/**
 * Gets text direction based on the language.
 *
 * @param language - A BCP 47 language tag, such as `ar`, `yi-US` or `ku-Arab`.
 * @returns `'rtl'` when the tag's script subtag, or its language when it has
 * no script subtag, is written right to left. Otherwise `'ltr'`.
 */
export const getTextDirection = function getTextDirection(
	language?: string
): 'rtl' | 'ltr' {
	if (!language) {
		return 'ltr';
	}
	const parts = language.toLowerCase().split('-');
	// Extensions and private use start at a single-letter subtag, and their
	// values (`en-u-nu-arab`, `x-arab`) can look like scripts. Stop before
	// them. A tag that starts with one has no language to read.
	const extensionStart = parts.findIndex((part) => part.length === 1);
	const [primary = '', ...subtags] =
		extensionStart === -1 ? parts : parts.slice(0, extensionStart);
	const script = subtags.find((subtag) => /^[a-z]{4}$/u.test(subtag));
	if (script) {
		return RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
	}
	return RTL_LANGUAGES.has(primary) ? 'rtl' : 'ltr';
};
