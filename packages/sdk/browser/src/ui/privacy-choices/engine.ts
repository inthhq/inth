/**
 * What the Privacy Choices parts call that keeps per-kernel state: the
 * surface session, the confirmations, the opt-out receipt, the receipt
 * focus and what reads them. The parts import these from here, never from
 * their packages.
 *
 * In the ESM build and the one-file script builds this only re-exports.
 * In `inth.choices.js` it is the engine's copy instead: the engine
 * publishes this module on `__inthChoicesEngine` before loading the file
 * (`../privacy-choices-file.ts`), and the build reads it from there, so
 * the file and the engine share one session per kernel. A stateful module
 * the file bundles anyway fails its build (`scripts/mode-bundle-boundary.ts`).
 *
 * @packageDocumentation
 * @internal
 */

export {
	applyDialogCategories,
	commitBannerChoice,
	commitDialogChoice,
	confirmSaleRight,
	copySurfaceReference,
	getSurfaceSession,
	pressSaleRight,
} from '@inth/sdk-core';
export { createPreferenceDraft } from '@inth/sdk-core/preference-draft';
export {
	closeOptInConfirmation,
	confirmOptInConfirmation,
	getOptOutReceiptData,
	hasConsentUI,
	isOptInConfirmationOpen,
	readFocusedElement,
	showConsentSurface,
	takeOptInConfirmationOpener,
} from '@inth/sdk-core/surface-actions';
export { takeReceiptFocus } from '../receipt-focus';
