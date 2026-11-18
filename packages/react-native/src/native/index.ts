/**
 * The bridge layer: the module lookup and the client built on it.
 *
 * Exported for apps that need the client outside React, for a test harness that
 * drives a mock module, and for an Expo module or native init hook that wants
 * the same client the provider uses.
 */

export { createConsentClient, getConsentClient } from './client';
export type {
	ConsentClient,
	SnapshotEquality,
	SnapshotSelector,
} from './client';
export { NativeBridgeError } from './bridge-error';
export { InthProtocolMismatchError } from './protocol-mismatch-error';
export {
	getNativeInth,
	getNativeInthEvents,
	hasNativeInthSurface,
	NativeInthUnavailableError,
} from './module';
export type {
	NativeInthTurboModule,
	NativeEventSubscription,
	NativeEventsLike,
} from './module';
export {
	closeConsentPresenter,
	onConsentPresenterOutcome,
	parseConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
} from './presenter';
export type {
	ConsentPresenterOutcome,
	ConsentPresenterSession,
} from './presenter';
