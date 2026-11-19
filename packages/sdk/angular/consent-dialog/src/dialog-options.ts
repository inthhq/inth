import type {
	ConsentDialogTriggerPosition,
	ConsentDialogTriggerSize,
	ConsentDialogTriggerVisibility,
} from '@inth/angular/consent-dialog-trigger';
import type { LegalLinks, Model } from '@inth/sdk/engine';

/**
 * The trigger `<inth-consent-dialog>` renders when `showTrigger` is an
 * object: the inputs of `<inth-consent-dialog-trigger>`.
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
 * belong to `<inth-iab-consent-dialog>`.
 */
export const DEFAULT_DIALOG_MODELS: ConsentDialogModels = [
	'opt-in',
	'opt-out',
	'none',
];
