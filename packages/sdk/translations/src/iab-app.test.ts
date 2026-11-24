import { describe, expect, it } from 'vite-plus/test';

import { baseTranslations } from './translations';
import type { IABAppTranslations } from './types';

const placeholders = (value: string | undefined) =>
	// `{name}` or an ICU plural `{name, plural, ...}`, which native copy evaluates.
	[...(value ?? '').matchAll(/\{(?<name>\w+)(?:\}|,\s*plural,)/gu)]
		.map((match) => match.groups?.name)
		.sort();

const english = baseTranslations.en.iab;
const appKeys = Object.keys(english.app ?? {}) as (keyof IABAppTranslations)[];
const languages = Object.entries(baseTranslations);

describe('iab.app copy for native apps', () => {
	it('English defines every app key', () => {
		expect(appKeys.sort()).toEqual([
			'consentStorage',
			'description',
			'legitimateInterestExplanation',
			'scopeServiceSpecific',
			'withdraw',
		]);
	});

	it.each(languages)(
		'%s defines every app key with the English placeholders',
		(_language, translations) => {
			const { app } = translations.iab;
			expect(app).toBeDefined();
			expect(Object.keys(app ?? {}).sort()).toEqual([...appKeys].sort());
			for (const key of appKeys) {
				const value = app?.[key];
				expect(value?.trim(), key).toBeTruthy();
				expect(placeholders(value), key).toEqual(
					placeholders(english.app?.[key])
				);
			}
		}
	);
});

describe('iab.banner copy keeps its placeholders', () => {
	const keys = [
		'description',
		'legitimateInterestNotice',
		'scopeServiceSpecific',
	] as const;

	it.each(languages)('%s', (_language, translations) => {
		for (const key of keys) {
			expect(placeholders(translations.iab.banner[key]), key).toEqual(
				placeholders(english.banner[key])
			);
		}
	});
});
