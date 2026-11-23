/**
 * `@inth/react` — React adapter for the Inth consent kernel.
 *
 * Pattern:
 *   import { InthProvider, useConsent, useSaveConsents } from '@inth/react';
 *
 *   function App({ children }) {
 *     return (
 *       <InthProvider options={{ projectUrl: '/api/inth' }}>
 *         {children}
 *       </InthProvider>
 *     );
 *   }
 *
 *   function MarketingScripts() {
 *     const allowed = useConsent('marketing');
 *     return allowed ? <GoogleTagManager /> : null;
 *   }
 */

// Re-export kernel types so consumers need only one import.
export type {
	AllConsentNames,
	CategoryDecision,
	ClearOnRevocationConfig,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
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
	PolicyRule,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
	ResolvedOptOutLink,
	ResolvedOptOutState,
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
} from './components/prompt';
// -- UI components ----------------------------------------------------------
export type { ConsentDialogProps } from './components/dialog/types';
export type {
	OptOutConfirmationCompoundComponent,
	OptOutConfirmationDoneButtonProps,
	OptOutConfirmationOverlayProps,
	OptOutConfirmationPreferencesLinkProps,
	OptOutConfirmationProps,
	OptOutConfirmationRootProps,
} from './components/opt-out-confirmation';
export type { ConsentDialogLinkProps } from './components/panel-link';
export type { PrivacyChoicesLinkProps } from './components/privacy-choices-link';
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
	InthProviderOptions,
	InthProviderCallbacks,
	InthProviderPrefetch,
	InthProviderProps,
	ExternalRuntimeProviderOptions,
	ExternalRuntimeProviderProps,
	OwnedRuntimeProviderProps,
} from './provider';
export type { ConsentThemeProps } from './consent-theme';
export type { Theme } from './types/theme';
export type { ReactUIOptions } from './types/manager';

export type {
	BannerEdge,
	CardPosition,
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentPresentation,
	DrawerSide,
	PromptPresentation,
	PreferencesPresentation,
	PresentationAction,
	ResolvedConsentLayout,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';

// Values, one group per file; see `index-parts/core.ts` for why.
// oxlint-disable oxc/no-barrel-file -- The package entry; star exports keep unused groups out of esbuild's first chunk.
export * from './index-parts/core';
export * from './index-parts/presets';
export * from './index-parts/consent-dialog';
export * from './index-parts/consent-banner';
export * from './index-parts/consent-dialog-link';
export * from './index-parts/privacy-choices-link';
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
