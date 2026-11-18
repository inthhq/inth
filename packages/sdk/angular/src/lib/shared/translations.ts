import { computed } from '@angular/core';
import type { Signal } from '@angular/core';
import type { Translations } from '@inth/sdk/engine';
import { resolveTranslations } from '@inth/sdk/ui/utils';

import type { ConsentManager } from '../core/consent-manager';
import { fallbackTranslations } from '../core/translation-defaults';

/**
 * The page's copy for the active language, completed with the English
 * defaults.
 *
 * @param consent - The consent manager.
 * @returns A signal of the resolved translations.
 * @internal
 */
export const resolvedTranslations = function resolvedTranslations(
	consent: ConsentManager
): Signal<Translations> {
	return computed(() => {
		const config = consent.translationConfig();
		return resolveTranslations(config, fallbackTranslations(config));
	});
};
