import type { Translations } from './translations.model';
import { translations as enTranslations } from './translations/en';

/**
 * Keyed on a global symbol so every copy of this module, including one
 * duplicated into another bundle chunk, shares the same registry.
 */
const REGISTRY_KEY = Symbol.for('inth.stockTranslations');

type StockRegistry = Map<string, Translations>;

const getRegistry = function getRegistry(): StockRegistry {
	const holder = globalThis as typeof globalThis & {
		[REGISTRY_KEY]?: StockRegistry;
	};
	holder[REGISTRY_KEY] ??= new Map([['en', enTranslations]]);
	return holder[REGISTRY_KEY];
};

/**
 * Record Inth's built-in copy for some languages.
 *
 * `@inth/sdk/translations/all` registers every bundled language when it loads,
 * and English is always registered. Code that merges app messages over
 * backend copy reads this to tell a stock string, which should not shadow
 * a backend edit, from a customized one.
 *
 * @internal
 */
export const registerStockTranslations = function registerStockTranslations(
	translations: Readonly<Record<string, Translations>>
): void {
	const registry = getRegistry();
	for (const [language, copy] of Object.entries(translations)) {
		registry.set(language, copy);
	}
};

/**
 * Inth's built-in copy for a language, or `undefined` until that language
 * is registered.
 */
export const getStockTranslations = function getStockTranslations(
	language: string
): Translations | undefined {
	return getRegistry().get(language);
};
