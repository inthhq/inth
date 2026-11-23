export type { AllConsentNames } from '@inth/sdk/engine';
export type {
	ConsentState,
	KernelActiveUI,
	KernelConfig,
} from '@inth/sdk/engine';
export {
	resolveActionLabels,
	resolveIABCopy,
	resolveOptOut,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceipt,
	resolveOptOutReceiptSentence,
	resolveOptOutState,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
export type {
	OptOutLinkIcon,
	OptOutLinkVariant,
	OptOutLocalAct,
	OptOutLock,
	OptOutReceipt,
	OptOutReceiptData,
	OptOutReceiptScope,
	OptOutReceiptSource,
	OptOutResult,
	OptOutState,
	OptOutVia,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ResolvedIABCopy,
	ResolvedOptOutLink,
	ResolvedOptOutState,
} from '@inth/sdk/engine';
export { focusTrap } from './actions/focus-trap';
export { portal } from './actions/portal';
export { scrollLock } from './actions/scroll-lock';
export { default as InlineLegalLinks } from './components/inline-legal-links.svelte';
export type {
	HeadlessConsentSurfaceState,
	SvelteIABState,
} from './consent-context.model';
export {
	getConsentKernel,
	getConsentManager,
	getHeadlessConsent,
	getIAB,
	getSnapshot,
} from './get-headless-consent';
export {
	getEventDispatcher,
	type EventDispatcher,
	type EventProperties,
	type GetEventDispatcherOptions,
} from './get-event-dispatcher';
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
export type { ConsentManagerOptions } from './consent-manager-options.model';
