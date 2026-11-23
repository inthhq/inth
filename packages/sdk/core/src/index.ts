/**
 * `@inth/sdk/engine` — kernel-first consent engine.
 *
 * Design goals:
 * - Pure construction: `createConsentKernel()` has zero side effects.
 *   No window writes, no observers, no network, no DOM.
 * - Framework-neutral contract: `getSnapshot() / subscribe() / set.* / commands.* / events`.
 *   No store library types leaked. Adapters own reactivity.
 * - Isomorphic-safe: imports cleanly in Node, RSC, edge runtimes.
 * - Opt-in side effects: persistence, blockers, script loader, banner fetch
 *   live in `@inth/sdk/modules/*` — adapters call them inside useEffect /
 *   onMounted / onMount. Never at kernel construction.
 */

export type {
	CategoryDecision,
	ChoiceBasis,
	CONSENT_CATEGORY,
	ConsentEvaluation,
	ConsentSubject,
	EvaluationPolicy,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
	PromptReason,
	PromptRequirement,
	RecordIssue,
	RestrictionReason,
} from './consent-record';
export {
	CONSENT_CATEGORIES,
	createEvaluationPolicy,
	evaluateConsentRecord,
	OPT_OUT_REPROMPT_WAIT_MS,
	OPTIONAL_CONSENT_CATEGORIES,
	optInPromptAllowedAt,
	optOutDecidingCategory,
	optOutDenyCategories,
	saveWouldLiftOptOut,
} from './consent-record';
export { createConsentKernel } from './kernel';

export {
	resolveIABBannerCopy,
	resolveIABBannerSummary,
	IAB_BANNER_MAX_DISPLAY_ITEMS,
} from './libs/iab-banner-summary';
export type {
	IABBannerCopy,
	ResolveIABBannerSummaryOptions,
} from './libs/iab-banner-summary';
export type {
	ClearOnRevocationConfig,
	ClearOnRevocationCookie,
	ClearOnRevocationTargets,
} from './modules/clear-on-revocation';
export type { KernelIABControls } from './modules/iab-controls';
export {
	getIABControls,
	registerIABControls,
	subscribeIABControls,
} from './modules/iab-controls';
export type {
	InthWindowDebug,
	WindowDebugHandle,
	WindowDebugMode,
	WindowDebugModeInput,
	WindowDebugOptions,
} from './modules/window-debug';
export { createWindowDebug } from './modules/window-debug';
export type { RememberedDecisionInputs } from './transports/decision-inputs';
export { decisionInputsMatchOverrides } from './transports/decision-inputs';
export type {
	CachedGvl,
	FetchCachedGvlOptions,
	GvlCache,
} from './transports/gvl-cache';
export { clearGvlCache, fetchCachedGvl } from './transports/gvl-cache';
export type {
	InthApiErrorCode,
	InthApiErrorDetail,
} from './transports/v1/error';
export { InthApiError, isInthApiError } from './transports/v1/error';
export type {
	V1HostedTransport,
	V1HostedTransportOptions,
} from './transports/v1/hosted';
export { createV1HostedTransport } from './transports/v1/hosted';
export { InthApiSaveRejectedError } from './transports/v1/save-rejected';
export {
	ConsentSaveRejectedError,
	isConsentSaveRejection,
} from './transports/save-rejection';
export {
	initOutputToKernelConfig,
	mapInitOutputToInitResponse,
	mergeInitOutputIntoKernelConfig,
} from './transports/init-output';
export type {
	HostedModeFactory,
	HostedModeOptions,
	ProviderTransportContext,
	ProviderTransportFactory,
	ProviderTransportKind,
} from './transports/mode';
export { earlyInitModes } from './transports/early-init-modes';
export type { EarlyInitMode } from './transports/early-init-modes';
export type {
	ConsentMode,
	ConsentModeType,
	HostedMode,
	ManifestMode,
	ManifestModeInputs,
	TestingMode,
	TestingModeOptions,
} from './modes';
export { hosted } from './modes';
export type { ConsentTesting } from './transports/testing';
export type {
	AdTechProvider,
	ConfirmedCoverage,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	GlobalVendorList,
	HydrationRecords,
	HydrationResult,
	InitContext,
	InitResponse,
	InitResult,
	KernelActiveUI,
	KernelBranding,
	KernelConfig,
	KernelHosting,
	KernelEvent,
	KernelIABAuthority,
	KernelIABState,
	KernelJourney,
	KernelModel,
	KernelOverrides,
	KernelPrivacySignals,
	KernelTranslations,
	KernelTransport,
	KernelUser,
	KernelVendorsState,
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	Listener,
	LocationResponse,
	NonIABVendor,
	NoticeDismissResult,
	OptInResult,
	OptOutHolder,
	OptOutMethod,
	OptOutPayload,
	OptOutRecord,
	OptOutResult,
	OptOutRight,
	OptOutTransportResult,
	PolicyResolution,
	PolicyScopeMode,
	ResolvedPolicyRule,
	ResolvedVendor,
	PromptSurface,
	SaveInput,
	SaveContext,
	SavePayload,
	SaveUISource,
	SaveResult,
	TranslationsResponse,
	Unsubscribe,
	Vendor,
	VendorChoice,
	VendorSource,
} from './types';

// -- Consent categories --------------------------------------------------------
export type { AllConsentNames, ConsentType } from './consent/consent-types';
export { allConsentNames, consentTypes } from './consent/consent-types';

// -- Consent conditions --------------------------------------------------------
export type { HasCondition } from './libs/has';
export { has } from './libs/has';
export { policyDefault } from './consent/consent-types';

// -- Storage -------------------------------------------------------------------
export type { StorageConfig } from './libs/cookie';
export { getRootDomain } from './libs/cookie';

// -- Blockers ------------------------------------------------------------------
export type {
	BlockedRequestInfo,
	NetworkBlockerConfig,
	NetworkBlockerRule,
} from './libs/network-blocker/types';
export type { IframeBlockerOptions } from './modules/iframe-blocker';

// -- Script loader -------------------------------------------------------------
export type {
	Script,
	ScriptCallbackInfo,
	ScriptDebugAction,
	ScriptDebugEvent,
	ScriptDebugEventInput,
	ScriptDebugListener,
	ScriptDebugScope,
	ScriptDebugSource,
	ScriptLifecycleCallback,
	ScriptServerStart,
	ScriptSource,
	ScriptUpdateResult,
	VendorDetails,
} from './libs/script-loader/types';
export {
	emitScriptDebugEvent,
	subscribeToScriptDebugEvents,
} from './libs/script-loader/debug';

// -- Provider option types -----------------------------------------------------
export type {
	AdditionalConsentConfig,
	Callback,
	Callbacks,
	CMPApi,
	CMPApiConfig,
	CMPStatus,
	DisplayStatus,
	EventStatus,
	IABConfig,
	LegalLink,
	LegalLinks,
	OnChoiceRecordedPayload,
	OnPermissionsChangedPayload,
	OnErrorPayload,
	OnSurfaceShownPayload,
	Overrides,
	PingData,
	PublisherRestriction,
	SSRInitialData,
	SSRInitRequestContext,
	SSRInitRequestMetadata,
	TCData,
	TCDataOutsideTCF,
	TCFApi,
	TCFApiCallback,
	TCFConsentData,
	User,
} from './options';
export type { ActiveUI, Model } from './types';

// -- Prefetch ------------------------------------------------------------------
export type { PrefetchOptions } from './libs/prefetch';
export {
	buildPrefetchScript,
	getMatchingPrefetchedInitialData,
	insertPrefetchScript,
	PREFETCH_SCRIPT_ID,
	primePrefetchedInitialData,
} from './libs/prefetch';

// -- Translations --------------------------------------------------------------
export type {
	CommonTranslations,
	ConsentManagerDialogTranslations,
	ConsentTypesTranslations,
	ConsentTypeTranslations,
	CookieBannerTranslations,
	I18nConfig,
	IABTranslations,
	LegalLinksTranslations,
	OptOutTranslations,
	TranslationConfig,
	Translations,
	TriggerTranslations,
} from '@inth/sdk-translations';
export {
	deepMergeTranslations,
	detectBrowserLanguage,
	mergeTranslationConfigs,
	prepareTranslationConfig,
} from '@inth/sdk-translations';
export {
	applyTranslationOverrides,
	defaultTranslationConfig,
	resolveLocalTranslations,
} from './translations';
export type { TranslationOverrides } from './translations';

// -- Schema re-exports ---------------------------------------------------------
export type {
	Branding,
	InitOutput,
	PolicyPrompt,
	PolicyResolutionFailure,
	PolicyRule,
	PolicyRulePresets,
	RecommendedPolicyRulesOptions,
} from '@inth/sdk-schema/types';
export {
	normalizePolicyRule,
	policyRulePresets,
	recommendedPolicyRules,
	readPolicyResolutionWire,
	resolvePolicyRules,
	writePolicyResolutionWire,
	safeFallbackPolicyRule,
} from '@inth/sdk-schema/types';
export {
	PROMPT_VARIANT_DEFAULT_POSITION,
	PROMPT_VARIANT_POSITIONS,
	resolveConsentPresentation,
} from './libs/policy-actions';
export {
	DEFAULT_CONSENT_CONTAINER,
	PHONE_LAYOUT_MAX_WIDTH,
	PHONE_LAYOUT_QUERY,
	resolveLayout,
} from './libs/consent-layout';
export type {
	BannerEdge,
	CardPosition,
	ConsentBlockingConstraint,
	ConsentContainer,
	ConsentContainerType,
	ConsentEdgeStyle,
	ConsentFlow,
	ConsentLayoutDiagnostic,
	ConsentLayoutOptions,
	ConsentPlacement,
	ConsentViewport,
	DrawerSide,
	ResolvedConsentLayout,
	ResolveLayoutInput,
} from './libs/consent-layout';
export {
	announcementText,
	commitBannerChoice,
	confirmSaleRight,
	copySurfaceReference,
	getSurfaceSession,
	initialSurfaceSession,
	isCurrentSurface,
	MAIN_LAYER,
	MAX_SURFACE_LAYERS,
	pressSaleRight,
	reduceSurfaceSession,
	resolveBannerCommit,
	resolveRightPress,
	resolveSaleRight,
	resolveSurfaceEscape,
	topLayer,
} from './surface-session';
export type {
	BannerCommitAction,
	BannerCommitOptions,
	BannerCommitOutcome,
	BannerCommitPlan,
	BannerKeptOff,
	RightCommandOptions,
	RightOption,
	RightPressInput,
	RightPressOutcome,
	RightPressResult,
	RightSource,
	RightsSnapshot,
	SaleRightState,
	SurfaceAnnouncement,
	SurfaceConfirmation,
	SurfaceCopy,
	SurfaceCopyFinish,
	SurfaceCopyStatus,
	SurfaceEscapeContext,
	SurfaceEscapeInput,
	SurfaceEscapeOutcome,
	SurfaceRight,
	SurfaceSession,
	SurfaceSessionAction,
	SurfaceSessionState,
	SurfaceSheet,
} from './surface-session';
export {
	defineExperiment,
	hostExperiment,
	seedExperiment,
} from './libs/experiment';
export {
	actionAppearanceFromTheme,
	applyExperimentAssignment,
	applyExperimentTheme,
	resolveExperimentTheme,
} from './libs/experiment-presentation';
export type { ActionAppearance } from './libs/experiment-presentation';
export type {
	ConsentExperiment,
	ExperimentActionStyle,
	ExperimentArm,
	ExperimentArmName,
	ExperimentArmTheme,
	ExperimentAssignment,
	ExperimentGate,
	ExperimentState,
	ServerExperiment,
	StartExperimentOptions,
} from './libs/experiment';
export type { ConsentJourneyOption, JourneyState } from './libs/journey';
export {
	EXPERIMENT_STORAGE_KEY,
	JOURNEY_STORAGE_KEY,
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
} from './libs/storage-keys';
export type {
	ConsentPresentation,
	PromptPresentation,
	PromptVariant,
	PromptPosition,
	FloatingPromptPosition,
	BarPromptPosition,
	WidgetPromptPosition,
	WallPromptPosition,
	PreferencesPresentation,
	SurfacePresentation,
	PresentationAction,
	PresentationDiagnostic,
	ResolvedConsentPresentation,
} from './libs/policy-actions';
export {
	resolveActionLabels,
	resolveBannerAllowedAnnouncement,
	resolveCategoryTitle,
	resolveGpcNote,
	resolveIABCopy,
	resolveNoticeBarDescription,
	resolveOptInConfirmationSentence,
	resolveOptInPromptCopy,
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
	resolvePreferencesRowCopy,
	resolvePrivacyChoicesCopy,
	resolvePromptCopy,
	resolveReceiptScope,
	resolveRightsBundle,
	resolveRightsPhrases,
	resolveSurfaceTranslations,
	resolveTriggerLabels,
	resolveVendorListCopy,
	scopePhrase,
} from './libs/consent-copy';
export type {
	OptInPromptCopy,
	OptOutLinkIcon,
	OptOutLinkVariant,
	PreferencesRowCopy,
	PrivacyChoicesSubject,
	PreferenceControl,
	PromptCopy,
	ResolvedIABCopy,
	ResolvedOptOutLink,
	RightsBundle,
	RightsPhrases,
} from './libs/consent-copy';
export {
	isOptedOut,
	resolveCategoryOptOutLock,
	resolveOptOut,
	resolveOptOutReceipt,
	resolveOptOutState,
} from './libs/opt-out-state';
export type {
	CategoryOptOutLockSnapshot,
	OptOutCheckSnapshot,
	OptOutLocalAct,
	OptOutLock,
	OptOutReceipt,
	OptOutReceiptData,
	OptOutReceiptScope,
	OptOutReceiptSource,
	OptOutState,
	OptOutVia,
	ResolvedOptOutState,
} from './libs/opt-out-state';

export {
	deniedVendorIds,
	evaluateConsent,
	getEffectiveGateState,
	isVendorAllowed,
	isVendorDenied,
} from './modules/has';
export type { RevocationReloadOptions } from './modules/revocation-reload';
export {
	hasRevokedPermission,
	isRevocationReloadEnabled,
	watchRevocationReload,
	willReloadOnRevocation,
} from './modules/revocation-reload';
export type { ResolveVendorsInput, VendorOwner } from './libs/vendors';
export { declareOwnedVendors, forgetOwnedVendors } from './libs/vendors';
export { vendorsListedUnder } from './libs/vendor-listing';
export { deferInitGvl } from './transports/gvl-reference';
export {
	IAB_UNAVAILABLE_ERROR_CODE,
	IABUnavailableError,
	policyNeedsIAB,
} from './libs/iab-unavailable';
export type {
	WebViewConsentSource,
	WebViewConsentState,
} from './runtime/webview-consent-source';
export { webViewConsentSource } from './runtime/webview-consent-source';
