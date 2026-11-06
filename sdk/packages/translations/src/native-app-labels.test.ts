import { describe, expect, it } from 'vitest';

import { nativeAppLabels } from './native-app-labels';
import { baseTranslations } from './translations';

const placeholders = (value: string | undefined) =>
	// `{name}` or an ICU plural `{name, plural, ...}`, which native copy evaluates.
	[...(value ?? '').matchAll(/\{(?<name>\w+)(?:\}|,\s*plural,)/gu)]
		.map((match) => match.groups?.name)
		.sort();

const english = nativeAppLabels.en ?? {};
const keys = Object.keys(english).sort();

describe('native IAB screen labels', () => {
	it('covers every built-in language', () => {
		expect(Object.keys(nativeAppLabels).sort()).toEqual(
			Object.keys(baseTranslations).sort()
		);
	});

	it.each(Object.entries(nativeAppLabels))(
		'%s defines every label with the English placeholders',
		(_language, labels) => {
			expect(Object.keys(labels).sort()).toEqual(keys);
			for (const key of keys) {
				const value = labels[key as keyof typeof labels];
				expect(value?.trim(), key).toBeTruthy();
				expect(placeholders(value), key).toEqual(
					placeholders(english[key as keyof typeof english])
				);
			}
		}
	);

	it('stays out of the published translations', () => {
		for (const translations of Object.values(baseTranslations)) {
			for (const key of keys) {
				expect(Object.keys(translations.iab.app ?? {})).not.toContain(key);
			}
		}
	});
});
