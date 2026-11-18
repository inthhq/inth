'use client';

import type { Translations } from '@inth/sdk/engine';
import { defaultTranslationConfig } from '@inth/sdk/surface-state';
import { useMemo } from 'react';

import { useTranslations as useKernelTranslations } from '../hooks';

export const useTranslations = function useTranslations(): Translations {
	const translations = useKernelTranslations();

	return useMemo(
		() =>
			(translations?.translations as Translations | undefined) ??
			(defaultTranslationConfig.translations.en as Translations),
		[translations]
	);
};
