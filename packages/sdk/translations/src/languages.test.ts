import { describe, expect, it } from 'vite-plus/test';

import i18n from '../i18n.json';
import manifest from '../package.json';
import { getStockTranslations } from './stock-translations.model';
import { baseTranslations } from './translations';

const languages = Object.keys(baseTranslations).filter(
	(language) => language !== 'en'
);

const exportsMap: Record<string, { import?: string } | undefined> =
	manifest.exports;

describe('per-language entry points', () => {
	it('cover the same languages as the copy, the exports and i18n.json', () => {
		const all = Object.keys(baseTranslations).toSorted();
		const exported = Object.keys(exportsMap)
			.filter((key) => /^\.\/[a-z]{2}$/u.test(key))
			.map((key) => key.slice(2))
			.toSorted();
		const translated = [i18n.locale.source, ...i18n.locale.targets].toSorted();

		expect(exported).toEqual(all);
		expect(translated).toEqual(all);
	});

	it('registers only the language it is imported for', async () => {
		expect(getStockTranslations('de')).toBeUndefined();
		expect(getStockTranslations('fr')).toBeUndefined();

		const german = await import('./languages/de');

		expect(german.translations).toBe(baseTranslations.de);
		expect(getStockTranslations('de')).toBe(baseTranslations.de);
		expect(getStockTranslations('fr')).toBeUndefined();
	});

	it.each(languages)('`./%s` exports and registers its copy', async (code) => {
		const entry = await import(`./languages/${code}.ts`);

		expect(entry.translations).toBe(
			baseTranslations[code as keyof typeof baseTranslations]
		);
		expect(getStockTranslations(code)).toBe(entry.translations);
	});

	it.each(languages)(
		'`./%s` is published as a side effect, so a bare import registers',
		(code) => {
			const target = exportsMap[`./${code}`]?.import;
			const sideEffects: boolean | string[] = manifest.sideEffects;

			expect(target).toBe(`./dist/languages/${code}.js`);
			expect(sideEffects).toContain('./dist/languages/*.js');
		}
	);
});
