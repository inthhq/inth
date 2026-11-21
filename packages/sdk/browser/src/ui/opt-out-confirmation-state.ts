/**
 * Per-kernel visibility state for the opt-out confirmation view.
 *
 * Re-exported from `@inth/sdk-core/surface-actions` so the browser UI shares
 * the same per-kernel state and post-reload restoration as every framework.
 *
 * @internal
 */
export {
	closeOptOutConfirmation,
	isOptOutConfirmationOpen,
	openOptOutConfirmation,
	readFocusedElement,
	subscribeOptOutConfirmation,
	takeOptOutConfirmationOpener,
} from '@inth/sdk-core/surface-actions';
