/**
 * `@inth/react` — React adapter for the Inth consent kernel.
 *
 * Pattern:
 *   import { ConsentProvider, useConsent, useSaveConsents } from '@inth/react';
 *
 *   function App({ children }) {
 *     return (
 *       <ConsentProvider options={{ projectUrl: '/api/inth' }}>
 *         {children}
 *       </ConsentProvider>
 *     );
 *   }
 *
 *   function MarketingScripts() {
 *     const allowed = useConsent('marketing');
 *     return allowed ? <GoogleTagManager /> : null;
 *   }
 *
 * Design notes:
 * - Selector hooks subscribe via `useSyncExternalStore` so re-renders
 *   stay scoped to the exact slice each hook reads.
 * - Action hooks return stable kernel methods — no `useCallback` dance
 *   required at the consumer site.
 * - No provider-level useEffect syncing state into React state. No
 *   cache patching. No method rewriting. Provider boot work is explicit
 *   module wiring around a single per-mount kernel.
 */

// Re-export kernel types so consumers need only one import.
export type {
	AllConsentNames,
	CategoryDecision,
	ClearOnRevocationConfig,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	HostedTransportOptions,
	InitContext,
	InitResponse,
	InitResult,
	KernelConfig,
	KernelEvent,
	KernelOverrides,
	KernelTransport,
	KernelUser,
	Listener,
	HostedMode,
	HostedModeOptions,
	PolicyRule,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
	SavePayload,
	SaveResult,
	Unsubscribe,
} from '@inth/sdk/engine';
// Engine types the guides use, so an app needs no `@inth/sdk` import.
export type {
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
export type { ConsentTesting } from '@inth/sdk/testing';
export type { WithProjectUrl } from '@inth/sdk/runtime';
export { hosted } from '@inth/sdk/modes';
export type {
	ConsentBannerButton,
	ConsentBannerLayout,
	ConsentBannerProps,
	ConsentBannerRight,
	ConsentBannerRightLinkProps,
	ConsentBannerRightsProps,
	ConsentBannerSurface,
} from './components/prompt';
// -- UI components ----------------------------------------------------------
export type {
	ConsentDialogCompoundComponent,
	ConsentDialogProps,
} from './components/panel';
export type { ConsentDialogLinkProps } from './components/panel-link';
export type {
	ConsentDialogTriggerProps,
	ConsentDialogTriggerToolbarAction,
	ConsentDialogTriggerToolbarPreferences,
	ConsentDialogTriggerToolbarProps,
	TriggerOrientation,
} from './components/panel-trigger';
export type {
	ConsentWidgetCompoundComponent,
	ConsentWidgetProps,
} from './components/preferences';
export type { ConsentGateProps, FrameProps } from './components/consent-gate';
export type {
	ConsentDraftHandle,
	ConsentDraftProviderProps,
	VendorDraftHandle,
} from './draft';
export type {
	EventDispatcher,
	EventProperties,
	UseEventDispatcherOptions,
} from './event-dispatcher';
export type {
	UseIframeBlockerOptions,
	UseNetworkBlockerOptions,
	UsePersistenceOptions,
	UseScriptLoaderOptions,
} from './module-hooks';
export type {
	ConsentProviderOptions,
	ConsentProviderCallbacks,
	ConsentProviderPrefetch,
	ConsentProviderProps,
	ExternalRuntimeProviderOptions,
	ExternalRuntimeProviderProps,
	OwnedRuntimeProviderProps,
} from './provider';
export type { ConsentThemeProps } from './consent-theme';
export type { Theme } from './types/theme';
export type { ConsentBannerCompoundComponent } from './components/prompt';
export type { ReactUIOptions } from './types/manager';

export type {
	ConsentPresentation,
	PromptPresentation,
	PreferencesPresentation,
	PresentationAction,
	PromptPosition,
	PromptVariant,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';

// Values, one group per file; see `index-parts/core.ts` for why.
// oxlint-disable oxc/no-barrel-file -- The package entry; star exports keep unused groups out of esbuild's first chunk.
export * from './index-parts/core';
export * from './index-parts/presets';
export * from './index-parts/consent-dialog';
export * from './index-parts/consent-banner';
export * from './index-parts/consent-dialog-link';
export * from './index-parts/consent-dialog-trigger';
export * from './index-parts/consent-gate';
export * from './index-parts/frame';
export * from './index-parts/draft';
export * from './index-parts/event-dispatcher';
export * from './index-parts/translations';
export * from './index-parts/module-hooks';
export * from './index-parts/provider';
export * from './index-parts/theme';
export * from './index-parts/hooks';
