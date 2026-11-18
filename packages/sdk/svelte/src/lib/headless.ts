export type { AllConsentNames } from '@inth/sdk/engine';
export type {
	ConsentState,
	KernelActiveUI,
	KernelConfig,
} from '@inth/sdk/engine';
export {
	resolveActionLabels,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
export type {
	PreferenceControl,
	PresentationAction,
	PromptCopy,
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
export { getIABTranslations, type IABTranslations } from './iab-translations';
export {
	getIABBannerDisplayItems,
	type ProcessedFeature,
	type ProcessedGVLData,
	type ProcessedPurpose,
	type ProcessedSpecialFeature,
	type ProcessedStack,
	type ProcessedVendor,
	processGVLData,
	type VendorId,
} from './iab-types';
export type { ConsentManagerOptions } from './types';
