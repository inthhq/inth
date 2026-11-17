/**
 * `@c15t/angular`: cookie banner, consent dialog, preference center and
 * headless consent state for Angular 20 and later.
 *
 * Each area owns one section below. Add exports only to your own section,
 * with an exact Edit, and keep the sections in this order.
 *
 * @packageDocumentation
 */

// core
export { provideC15t } from './lib/core/provide-c15t';
export { C15T_OPTIONS } from './lib/core/options';
// Private (`ɵ`): the TransferState key `@c15t/angular/ssr` writes.
export {
	C15T_SERVER_STATE as ɵC15T_SERVER_STATE,
	C15T_SERVER_STATE_GATE as ɵC15T_SERVER_STATE_GATE,
	ServerStateGate as ɵServerStateGate,
} from './lib/core/server-state';
export type {
	C15tCallbacks,
	C15tOptions,
	C15tProviderOptions,
	C15tResolvedOptions,
	C15tRuntimeOptions,
	C15tSharedOptions,
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
export {
	resolveComponentStyles,
	resolveConsentActionStyle,
	toStyleAttribute,
} from './lib/core/slot-styles';
export { fallbackTranslations } from './lib/core/translation-defaults';
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
export type { ConsentTesting } from '@c15t/core/testing';
export { defaultTranslationConfig } from './lib/core/translation-defaults';
export {
	detectBrowserLanguage,
	mergeTranslationConfigs,
	prepareTranslationConfig,
} from '@c15t/translations';
export {
	resolveActionLabels,
	resolveConsentPresentation,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@c15t/core/surface-state';

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
	PolicyRule,
	PolicyScopeMode,
	PreferenceControl,
	PresentationAction,
	PromptCopy,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
	ResolvedConsentPresentation,
	SavePayload,
	SaveResult,
	Translations,
	TranslationsResponse,
} from '@c15t/core';
export { createConsentRuntime } from '@c15t/core/runtime';
export type {
	ConsentRuntime,
	ConsentRuntimeIABFactory,
	ConsentRuntimeIABHandle,
	ConsentRuntimeOptions,
} from '@c15t/core/runtime';
export type {
	BrowserManifestModeFactory,
	BrowserManifestOptions as ManifestModeOptions,
} from '@c15t/core/transports/manifest-browser';
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
} from '@c15t/ui/theme';

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
	resolvedTranslations as ɵresolvedTranslations,
	selectLegalLinks as ɵselectLegalLinks,
	shouldShowBranding as ɵshouldShowBranding,
} from './lib/shared';
export type { LegalLinkSelection as ɵLegalLinkSelection } from './lib/shared';
