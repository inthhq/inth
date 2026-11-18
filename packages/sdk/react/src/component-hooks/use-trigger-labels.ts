'use client';

import { resolveTriggerLabels } from '@inth/sdk/engine';
import type { TriggerTranslations } from '@inth/sdk/engine';
import { useMemo } from 'react';

import { useTranslations } from './use-translations';

/**
 * Accessible names for the trigger, its toolbar and the DevTools item, in
 * the active language.
 *
 * @returns The `trigger` translations, each missing key in English.
 * @internal
 */
export const useTriggerLabels =
	function useTriggerLabels(): TriggerTranslations {
		const translations = useTranslations();
		return useMemo(() => resolveTriggerLabels(translations), [translations]);
	};
