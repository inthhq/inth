import { describe, expect, it } from 'vite-plus/test';

import { nativeAppLabels, nativeConsentLabels } from './native-app-labels';
import { baseTranslations } from './translations';

const placeholders = (value: string | undefined) =>
	// `{name}` or an ICU plural `{name, plural, ...}`, which native copy evaluates.
	[...(value ?? '').matchAll(/\{(?<name>\w+)(?:\}|,\s*plural,)/gu)]
		.map((match) => match.groups?.name)
		.sort();

describe.each([
	['native IAB screen labels', nativeAppLabels],
	['native category-mode labels', nativeConsentLabels],
] as const)('%s', (_name, labelsByLanguage) => {
	const english: Record<string, string> = labelsByLanguage.en ?? {};
	const keys = Object.keys(english).sort();

	it('covers every built-in language', () => {
		expect(Object.keys(labelsByLanguage).sort()).toEqual(
			Object.keys(baseTranslations).sort()
		);
	});

	it.each(Object.entries(labelsByLanguage))(
		'%s defines every label with the English placeholders',
		(_language, labels: Record<string, string>) => {
			expect(Object.keys(labels).sort()).toEqual(keys);
			for (const key of keys) {
				const value = labels[key];
				expect(value?.trim(), key).toBeTruthy();
				expect(placeholders(value), key).toEqual(placeholders(english[key]));
			}
		}
	);

	it('stays out of the published translations', () => {
		for (const translations of Object.values(baseTranslations)) {
			expect(translations).not.toHaveProperty('native');
			for (const key of keys) {
				expect(Object.keys(translations.iab.app ?? {})).not.toContain(key);
			}
		}
	});
});
