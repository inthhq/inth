import type {
	ConsentDialogTriggerPosition,
	ConsentDialogTriggerSize,
	ConsentDialogTriggerVisibility,
} from '@c15t/angular/consent-dialog-trigger';
import type { LegalLinks, Model } from '@c15t/core';

/**
 * The trigger `<c15t-consent-dialog>` renders when `showTrigger` is an
 * object: the inputs of `<c15t-consent-dialog-trigger>`.
 */
export interface ConsentDialogTriggerOptions {
	defaultPosition?: ConsentDialogTriggerPosition;
	persistPosition?: boolean;
	showWhen?: ConsentDialogTriggerVisibility;
	size?: ConsentDialogTriggerSize;
	label?: string;
	noStyle?: boolean;
	rootClass?: string;
}

/** Which of the provider's legal links the dialog shows. */
export type ConsentDialogLegalLinks = readonly (keyof LegalLinks)[] | null;

/** The policy models the dialog opens for. */
export type ConsentDialogModels = readonly Model[];

/**
 * The models the dialog opens for by default, as React's dialog. A `none`
 * rule that grants the preferences right still opens it. IAB policies
 * belong to `<c15t-iab-consent-dialog>`.
 */
export const DEFAULT_DIALOG_MODELS: ConsentDialogModels = [
	'opt-in',
	'opt-out',
	'none',
];
