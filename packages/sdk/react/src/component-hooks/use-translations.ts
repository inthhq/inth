'use client';

import type { Translations } from '@inth/sdk/engine';
import { resolveSurfaceTranslations } from '@inth/sdk/surface-state';
import { useMemo } from 'react';

import { useTranslations as useKernelTranslations } from '../hooks';

export const useTranslations = function useTranslations(): Translations {
	const translations = useKernelTranslations();

	return useMemo(
		() => resolveSurfaceTranslations({ translations }) as Translations,
		[translations]
	);
};
