/**
 * `@inth/angular`: cookie banner, consent dialog, preference center and
 * headless consent state for Angular 20 and later.
 *
 * Each area owns one section below. Add exports only to your own section,
 * with an exact Edit, and keep the sections in this order.
 *
 * @packageDocumentation
 */

// core
export { provideInth } from './lib/core/provide-inth';
export { INTH_OPTIONS } from './lib/core/options';
// Private (`ɵ`): the TransferState key `@inth/angular/ssr` writes.
export {
	SERVER_STATE_KEY as ɵINTH_SERVER_STATE,
	SERVER_STATE_GATE as ɵINTH_SERVER_STATE_GATE,
	ServerStateGate as ɵServerStateGate,
} from './lib/core/server-state';
export type {
	InthCallbacks,
	InthOptions,
	InthProviderOptions,
	InthResolvedOptions,
	InthRuntimeOptions,
	InthSharedOptions,
	NetworkBlockerOptions,
	PersistenceOptions,
	ProviderIABOptions,
	ScriptLoaderOptions,
} from './lib/core/options';
export { ConsentManager } from './lib/core/consent-manager';
export type {
	AngularIABState,
	ConsentDraftState,
	SaveType,
} from './lib/core/consent-manager';
export { HeadlessConsent } from './lib/core/headless-consent';
export type {
	HeadlessConsentAction,
	HeadlessConsentSurfaceState,
} from './lib/core/headless-consent';
export { ConsentTheme } from './lib/core/consent-theme';
export {
	BANNER_SHEETS,
	CONSENT_GATE_SHEETS,
	ConsentStyles,
	SURFACE_SCOPES,
	TRIGGER_SHEETS,
} from './lib/core/consent-styles';
export type { SurfaceStyleSheet } from './lib/core/consent-styles';
export { whenIABReady } from './lib/core/iab-loader';
export {
	holdIdleDialogWarming,
	registerDialogWarmer,
	warmDialog,
} from './lib/core/dialog-warming';
// Private (`ɵ`): the idle boundary the IAB dialog's prefetch waits for.
export { whenPageIdle as ɵwhenPageIdle } from './lib/core/dialog-warming';
export type { DialogPreload } from './lib/core/dialog-warming';
export { manifest } from './lib/core/modes';
export { hosted, type HostedMode } from '@inth/sdk/modes';
export type { ConsentTesting } from '@inth/sdk/testing';
export { defaultTranslationConfig } from '@inth/sdk/surface-state';
export {
	detectBrowserLanguage,
	mergeTranslationConfigs,
	prepareTranslationConfig,
} from '@inth/sdk/translations';
export {
	resolveActionLabels,
	resolveConsentPresentation,
	resolveOptInConfirmationSentence,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceipt,
	resolveOptOutReceiptSentence,
	resolveOptOutState,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/surface-state';
export type {
	OptOutReceipt,
	OptOutReceiptScope,
	OptOutReceiptSource,
} from '@inth/sdk/surface-state';

export type {
	ActiveUI,
	AllConsentNames,
	ClearOnRevocationConfig,
	ConsentKernel,
	ConsentMode,
	ConsentPresentation,
	ConsentSnapshot,
	ConsentState,
	ConsentType,
	GlobalVendorList,
	HasCondition,
	HostedModeFactory,
	HostedModeOptions,
	I18nConfig,
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
	LegalLinks,
	LocationResponse,
	NonIABVendor,
	OptOutLinkIcon,
	OptOutLinkVariant,
	OptOutLock,
	OptOutResult,
	OptOutVia,
	PolicyRule,
	PolicyScopeMode,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
	ResolvedConsentPresentation,
	ResolvedOptOutLink,
	ResolvedOptOutState,
	SavePayload,
	SaveResult,
	Translations,
	TranslationsResponse,
} from '@inth/sdk/engine';
export { createConsentRuntime } from '@inth/sdk/runtime';
export type {
	ConsentRuntime,
	ConsentRuntimeIABFactory,
	ConsentRuntimeIABHandle,
	ConsentRuntimeOptions,
} from '@inth/sdk/runtime';
export type {
	BrowserManifestModeFactory,
	BrowserManifestOptions as ManifestModeOptions,
} from '@inth/sdk/transports/manifest-browser';
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

// directives
export { IfConsent } from './lib/core/if-consent';
export type { IfConsentContext } from './lib/core/if-consent';
export { ConsentDialogLink } from './lib/dialog/consent-dialog-link';
export { FocusTrap } from './lib/overlay/focus-trap';
export type { FocusTrapParams } from './lib/overlay/focus-trap';
export { ScrollLock } from './lib/overlay/scroll-lock';
export { Portal } from './lib/overlay/portal';

// banner
export { ConsentButton } from './lib/shared';
export type {
	ConsentButtonAction,
	ConsentButtonMode,
	ConsentButtonSize,
	ConsentButtonVariant,
} from './lib/shared';
export {
	ConsentBannerAction,
	ConsentBannerDescription,
	ConsentBannerTitle,
	ConsentBanner,
} from './lib/banner';
export type {
	BannerActionContext,
	BannerCopyContext,
	ConsentBannerButton,
	ConsentBannerLayout,
} from './lib/banner';

// Private (`ɵ`): building blocks the package's other entry points share.
// An entry point imports another only by its package name, so these are
// exported here; they are not part of the public API.
export { bannerVisibility as ɵbannerVisibility } from './lib/banner/banner-visibility';
export type { BannerVisibility as ɵBannerVisibility } from './lib/banner/banner-visibility';
export { Overlay as ɵOverlay } from './lib/overlay/overlay';
export { OptInConfirmation as ɵOptInConfirmation } from './lib/dialog/opt-in-confirmation';
export {
	focusInitially as ɵfocusInitially,
	InitialFocus as ɵInitialFocus,
	returnFocusAfterDialog as ɵreturnFocusAfterDialog,
} from './lib/overlay/dialog-focus';
export { SURFACE_CLOSED as ɵSURFACE_CLOSED } from './lib/core/surface-close';
export { uniqueId as ɵuniqueId } from './lib/core/unique-id';
export {
	NoStyleScope as ɵNoStyleScope,
	resolveNoStyle as ɵresolveNoStyle,
} from './lib/core/no-style';
export {
	BrandMarkIcon as ɵBrandMarkIcon,
	Branding as ɵBranding,
	InlineLegalLinks as ɵInlineLegalLinks,
	PolicyActions as ɵPolicyActions,
	shouldShowBranding as ɵshouldShowBranding,
} from './lib/shared';
export type { LegalLinkSelection as ɵLegalLinkSelection } from './lib/shared';

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
