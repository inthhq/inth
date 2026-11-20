'use client';

import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';
import { isOptOutTrigger } from '@inth/sdk/surface-actions';
import { isTriggerVisible } from '@inth/sdk/ui/utils/trigger-utils';
import { useCallback } from 'react';

import {
	useActiveUI,
	useHasConsentPreferences,
	useOptOut,
	usePromptRequirement,
	useSetActiveUI,
	useSnapshot,
} from '../hooks';
import { useOptOutConfirmationOpen } from '../hooks/use-opt-out';

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
	isOptOut: boolean;
	isVisible: boolean;
	openDialog: () => void;
}

/** Persistent preferences access does not depend on a choice or prompt. */
export const useConsentDialogTrigger = function useConsentDialogTrigger(
	options: UseConsentDialogTriggerOptions = {}
): UseConsentDialogTriggerResult {
	const { showWhen = 'always', onClick } = options;
	const setActiveUI = useSetActiveUI();
	const optOut = useOptOut();
	const activeUI = useActiveUI();
	const confirmationOpen = useOptOutConfirmationOpen();
	const snapshot = useSnapshot();
	const promptRequirement = usePromptRequirement();
	const hasConsentUI = useHasConsentPreferences();
	const isOptOut = isOptOutTrigger(snapshot);
	const openDialog = useCallback(() => {
		onClick?.();
		if (isOptOut) {
			void optOut();
		} else {
			setActiveUI('dialog');
		}
	}, [isOptOut, onClick, optOut, setActiveUI]);
	return {
		isOptOut,
		isVisible: isTriggerVisible({
			dialogOpen: activeUI === 'dialog' || confirmationOpen,
			hasConsentPreferences: hasConsentUI,
			promptOwed: promptRequirement.kind !== 'none',
			showWhen,
		}),
		openDialog,
	};
};
