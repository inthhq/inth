export type { AllConsentNames } from '@inth/sdk/engine';
export type {
	ConsentState,
	KernelActiveUI,
	KernelConfig,
} from '@inth/sdk/engine';
export {
	resolveActionLabels,
	resolveIABCopy,
	resolveOptOutCopy,
	resolveOptOutState,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
export type {
	OptOutLock,
	OptOutVia,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ResolvedIABCopy,
	ResolvedOptOutState,
} from '@inth/sdk/engine';
export { focusTrap } from './actions/focus-trap';
export { portal } from './actions/portal';
export { scrollLock } from './actions/scroll-lock';
export { default as InlineLegalLinks } from './components/inline-legal-links.svelte';
export {
	getConsentKernel,
	getConsentManager,
	getHeadlessConsent,
	getIAB,
	getSnapshot,
	type HeadlessConsentSurfaceState,
	type SvelteIABState,
} from './context.svelte';
export {
	getEventDispatcher,
	type EventDispatcher,
	type EventProperties,
	type GetEventDispatcherOptions,
} from './event-dispatcher';
export {
	type HeadlessIABVendorId,
	type ProcessedFeature,
	type ProcessedGVLData,
	type ProcessedPurpose,
	type ProcessedSpecialFeature,
	type ProcessedStack,
	type ProcessedVendor,
	processGVLForDialog,
	resolveIABBannerSummary,
} from '@inth/sdk/iab/headless';
export type { ConsentManagerOptions } from './types';
