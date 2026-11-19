'use client';

import type { ActiveUI, ConsentPresentation } from '@inth/sdk/engine';
import { useCallback } from 'react';

import { useHeadlessConsentUI } from '../component-hooks/use-headless-consent-ui';
import {
	useActiveUI,
	useModel,
	useSetActiveUI,
	useTranslations,
} from '../hooks';
import { useIAB } from '../iab-context';

export const useIABConsentManager = function useIABConsentManager(
	overrides?: ConsentPresentation
) {
	const activeUI = useActiveUI();
	const model = useModel();
	const { banner: policyBanner, dialog: policyDialog } =
		useHeadlessConsentUI(overrides);
	const setKernelActiveUI = useSetActiveUI();
	const translations = useTranslations();
	const iab = useIAB();
	const setActiveUI = useCallback(
		(ui: ActiveUI, _options?: { force?: boolean }) => {
			setKernelActiveUI(ui);
		},
		[setKernelActiveUI]
	);

	return {
		activeUI: (activeUI ?? 'none') as ActiveUI,
		iab,
		/** The active language, for text direction. */
		language: translations?.language,
		model,
		policyBanner,
		policyDialog,
		setActiveUI,
	};
};
