/**
 * The init script's stand-in for `@inth/sdk/engine`'s translations module inside
 * `buildInitialSnapshot`.
 *
 * Core's `applyTranslationOverrides` compares app overrides with Inth's
 * built-in copy, so it carries bundled English. The init script passes no
 * overrides (a page with `i18n` options leaves the banner to the engine),
 * and without them core only renames legacy keys, which this does the same
 * way. Given overrides it throws, so the snapshot cannot be read and the
 * engine decides. `rslib.config.ts` swaps this in for `inth.js` only.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelTranslations } from '@inth/sdk-core';
import type { Translations } from '@inth/sdk-translations';
import { migrateLegacyTranslationKeys } from '@inth/sdk-translations';

/**
 * `applyTranslationOverrides` without overrides.
 *
 * @param overrides - Must be absent.
 * @returns The translations with legacy keys renamed.
 * @throws {Error} When overrides are given.
 */
export const applyTranslationOverrides = function applyTranslationOverrides(
	resolved: KernelTranslations,
	overrides: unknown
): KernelTranslations {
	if (overrides) {
		throw new Error('@inth/sdk: inth.js does not apply i18n overrides.');
	}
	const migrated = migrateLegacyTranslationKeys(
		resolved.translations as Partial<Translations>
	);
	return migrated === resolved.translations
		? resolved
		: {
				...resolved,
				translations: migrated as KernelTranslations['translations'],
			};
};
