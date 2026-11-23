import { resolveSurfaceTranslations } from '@inth/sdk/surface-state';
import type { CompleteTranslations } from '@inth/sdk/translations';
import { computed } from 'vue';
import type { ComputedRef } from 'vue';

import { useConsentInit } from './use-consent-init';

/**
 * The copy a consent surface renders: the init translations for the
 * active language with English filling every key they leave out, so a
 * surface has text before init has delivered any.
 *
 * @internal
 */
export const useSurfaceTranslations =
	function useSurfaceTranslations(): ComputedRef<CompleteTranslations> {
		const init = useConsentInit();
		return computed(() => resolveSurfaceTranslations(init.value));
	};
