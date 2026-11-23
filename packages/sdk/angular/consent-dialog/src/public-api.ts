/**
 * `@inth/angular/consent-dialog`: the consent dialog. The component is a
 * small host; the dialog's body, with the widget and primitives it renders,
 * is a chunk of its own that it loads.
 *
 * @packageDocumentation
 */

export { ConsentDialog } from './consent-dialog';
export { OptOutConfirmation } from './opt-out-confirmation';
export { DEFAULT_DIALOG_MODELS } from './consent-dialog-options.model';
export type {
	ConsentDialogLegalLinks,
	ConsentDialogModels,
	ConsentDialogTriggerOptions,
} from './consent-dialog-options.model';
