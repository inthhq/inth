export {
	defaultTranslationConfig,
	detectBrowserLanguage,
	mergeTranslationConfigs,
	policyRulePresets,
	prepareTranslationConfig,
} from '@inth/sdk/engine';
export type {
	AllConsentNames,
	ClearOnRevocationConfig,
	ConsentType,
	I18nConfig,
	LegalLinks,
	Translations,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	GlobalVendorList,
	InitResponse,
	KernelActiveUI,
	KernelBranding,
	KernelConfig,
	KernelEvent,
	KernelIABState,
	KernelModel,
	KernelOverrides,
	KernelTranslations,
	KernelTransport,
	KernelUser,
	LocationResponse,
	NonIABVendor,
	PolicyRule,
	PolicyScopeMode,
	ConsentMode,
	HostedModeFactory,
	HostedModeOptions,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
	SavePayload,
	SaveResult,
	TranslationsResponse,
} from '@inth/sdk/engine';
export { createConsentRuntime } from '@inth/sdk/runtime';
export type {
	ConsentRuntime,
	ConsentRuntimeIABFactory,
	ConsentRuntimeIABHandle,
	ConsentRuntimeOptions,
} from '@inth/sdk/runtime';
export * from '@inth/sdk/ui/primitives';
export * from '@inth/sdk/ui/styles/primitives';
export type {
	ColorTokens,
	ComponentSlots,
	MotionTokens,
	RadiusTokens,
	ShadowTokens,
	SlotStyle,
	SpacingTokens,
	Theme,
	TypographyTokens,
} from '@inth/sdk/ui/theme';
export { focusTrap } from './actions/focus-trap';
export { portal } from './actions/portal';
export { scrollLock } from './actions/scroll-lock';
export { default as ConsentBanner } from './components/prompt.svelte';
export { default as ConsentButton } from './components/action-button.svelte';
export { default as ConsentDialog } from './components/deferred-panel.svelte';
export { default as ConsentDialogLink } from './components/panel-link.svelte';
export { default as ConsentDialogTrigger } from './components/panel-trigger.svelte';
export { default as ConsentProvider } from './components/consent-provider.svelte';
export { default as ConsentRoot } from './components/consent-root.svelte';
export { default as ConsentWidget } from './components/preferences.svelte';
export { default as ConsentGate } from './components/consent-gate.svelte';
export { default as IABConsentBanner } from './components/iab-prompt.svelte';
export { default as IABConsentDialog } from './components/iab-panel.svelte';
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
	Accordion,
	Collapsible,
	Dialog,
	Portal,
	PreferenceItem,
	Switch,
	Tabs,
} from './primitives';
export type {
	ConsentManagerOptions,
	ConsentProviderCallbacks,
	ConsentRootState,
	ProviderIABOptions,
	SvelteUIOptions,
	UseNetworkBlockerOptions,
	UsePersistenceOptions,
	UseScriptLoaderOptions,
} from './types';
export type { DialogPreload } from './dialog-warming';
export type { ConsentTesting } from '@inth/sdk/testing';
export type { ManifestModeOptions } from './transports/manifest';
export { manifest } from './transports/manifest';
export { hosted, type HostedMode } from '@inth/sdk/modes';
export type { BrowserManifestModeFactory } from '@inth/sdk/transports/manifest-browser';

export type { ConsentManagerState, ConsentDraftState } from './context.svelte';
export {
	resolveActionLabels,
	resolveConsentPresentation,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/engine';
export type {
	ConsentPresentation,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';

// Engine types the guides use; the helpers are in the `engine` entry.
export type {
	CategoryDecision,
	ExperimentArmName,
	ExperimentAssignment,
	PrefetchOptions,
	ResolvedVendor,
	Script,
	ScriptCallbackInfo,
	TCData,
	TCDataOutsideTCF,
	Vendor,
} from '@inth/sdk/engine';
export { defineTheme, generateThemeCSS } from '@inth/sdk/ui/theme';
