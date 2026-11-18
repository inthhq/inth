import { resolveIABCopy } from '@inth/sdk/engine';
import type { IABTranslations } from '@inth/sdk/engine';
import { useMemo } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';

/**
 * The IAB copy for the active language, each missing key filled from
 * English.
 *
 * @returns Complete IAB translations.
 */
export const useIABTranslations =
	function useIABTranslations(): IABTranslations {
		const translations = useTranslations();
		return useMemo(() => resolveIABCopy(translations), [translations]);
	};
