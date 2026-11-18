import { resolveIABCopy } from '@inth/sdk/surface-state';
import type { ResolvedIABCopy } from '@inth/sdk/surface-state';
import type { Translations } from '@inth/sdk/translations';
import { computed, toValue } from 'vue';
import type { ComputedRef } from 'vue';

import { useConsentInit } from './init';

/**
 * The IAB copy for the active language, each key the bundle leaves out
 * filled from English.
 *
 * @returns The complete IAB translations for the active language.
 */
export const useIabTranslations =
	function useIabTranslations(): ComputedRef<ResolvedIABCopy> {
		const init = useConsentInit();
		return computed(() =>
			resolveIABCopy(
				toValue(init)?.translations?.translations as
					| Partial<Translations>
					| undefined
			)
		);
	};
