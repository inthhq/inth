'use client';

import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';
import { isTriggerVisible } from '@inth/sdk/ui/utils/trigger-utils';
import { useCallback } from 'react';

import {
	useActiveUI,
	useHasConsentPreferences,
	usePromptRequirement,
	useSetActiveUI,
} from '../hooks';

/**
 * When a trigger surface is visible.
 *
 * - `always` renders whenever the preference center is closed.
 * - `after-consent` renders only once no prompt is owed: after a choice is
 *   saved or a notice is dismissed, and again once a policy change that
 *   asks for a new prompt is answered.
 * - `never` hides the surface so the host can open the dialog itself.
 */
export type { ConsentDialogTriggerVisibility };
export interface UseConsentDialogTriggerOptions {
	showWhen?: ConsentDialogTriggerVisibility;
	onClick?: () => void;
}
export interface UseConsentDialogTriggerResult {
	isVisible: boolean;
	openDialog: () => void;
}

/** Persistent preferences access does not depend on a choice or prompt. */
export const useConsentDialogTrigger = function useConsentDialogTrigger(
	options: UseConsentDialogTriggerOptions = {}
): UseConsentDialogTriggerResult {
	const { showWhen = 'always', onClick } = options;
	const setActiveUI = useSetActiveUI();
	const activeUI = useActiveUI();
	const promptRequirement = usePromptRequirement();
	const hasConsentUI = useHasConsentPreferences();
	const openDialog = useCallback(() => {
		onClick?.();
		setActiveUI('dialog');
	}, [onClick, setActiveUI]);
	return {
		isVisible: isTriggerVisible({
			dialogOpen: activeUI === 'dialog',
			hasConsentPreferences: hasConsentUI,
			promptOwed: promptRequirement.kind !== 'none',
			showWhen,
		}),
		openDialog,
	};
};
