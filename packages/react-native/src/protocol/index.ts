/**
 * The native boundary: every type that crosses the TurboModule, plus the
 * version handshake that guards it.
 *
 * Everything here is types and constants. There is no runtime consent logic
 * in this package on purpose — the Swift and Kotlin cores own consent state,
 * and the JavaScript layer renders it. The names it renders are this package's
 * own: see `./vocabulary`, which holds them instead of importing the web
 * kernel, and is checked against that kernel by the vocabulary tests.
 */

export type { BootstrapPayload } from './bootstrap-payload.model';
export type {
	CommitFailureReason,
	CommitIntent,
	NativeIABChoices,
	CommitResult,
	NativeSavePayload,
} from './commit-payload.model';
export { COMMIT_FAILURE_REASONS } from './commit-payload.model';
export type {
	GlobalVendorList,
	GVLDataCategory,
	GVLFeature,
	GVLPurpose,
	GVLSpecialFeature,
	GVLSpecialPurpose,
	GVLStack,
	GVLVendor,
	GVLVendorDataRetention,
	GVLVendorOverflow,
	GVLVendorUrl,
} from './global-vendor-list.model';
export type { NativeInitializedEvent, NativeSnapshotEvent } from './native-events.model';
export type { NativeOverrides, NativeOverridesInput } from './native-overrides.model';
export { defaultNativeOverrides } from './native-overrides.model';
export type {
	TrackingAuthorization,
	TrackingAuthorizationPayload,
	NativeTrackingRequestOptions,
	TrackingPresentation,
	TrackingRequestPayload,
	TrackingRequestStage,
} from './tracking-protocol.model';
export {
	parseTrackingAnsweredAt,
	parseTrackingAuthorization,
	parseTrackingRequest,
	TRACKING_AUTHORIZATION_STATUSES,
	TRACKING_PRESENTATIONS,
	TRACKING_REQUEST_STAGES,
} from './tracking-protocol.model';
export type {
	ConsentSnapshot,
	NativeAdTechProvider,
	NativeIABCommittedConsent,
	NativeIABCustomVendor,
	NativeIABDisclosure,
	NativeIABHeadlessGap,
	NativeIABPurposePartnerCounts,
	NativeIABState,
	NativeIABVendorDisclosure,
	NativeConsentSubject,
	NativeModel,
	NativeGpcSignal,
	NativePrivacySignals,
	NativeSnapshotError,
	PolicyResolutionFailure,
	SnapshotResolution,
} from './consent-snapshot.model';
export { POLICY_RESOLUTION_FAILURES } from './consent-snapshot.model';
export type {
	AllConsentNames,
	CategoryDecision,
	ChoiceBasis,
	ConsentState,
	ConsentSubject,
	ExplicitChoice,
	KernelActiveUI,
	KernelCookieBannerCopy,
	KernelCommonCopy,
	KernelModel,
	KernelTranslationBundle,
	KernelTranslationGroups,
	KernelTranslationPair,
	KernelTranslations,
	LocationResponse,
	OptOutHolder,
	OptOutMethod,
	OptOutRecord,
	OptOutRight,
	OptionalConsentCategory,
	PolicyResolutionStatus,
	PromptReason,
	PromptRequirement,
	RestrictionReason,
} from './consent-vocabulary.model';
export {
	ACTIVE_SURFACES,
	CONSENT_CATEGORIES,
	NATIVE_MODELS,
	OPT_OUT_HOLDERS,
	OPT_OUT_METHODS,
	OPT_OUT_RIGHTS,
	OPTIONAL_CONSENT_CATEGORIES,
	PROMPT_REASONS,
	RESTRICTION_REASONS,
} from './consent-vocabulary.model';
export {
	describeProtocolMismatch,
	isProtocolVersionSupported,
	MAX_SUPPORTED_PROTOCOL_VERSION,
	MIN_SUPPORTED_PROTOCOL_VERSION,
	PROTOCOL_VERSION,
} from './protocol-version.model';

export {
	ADDITIVE_SNAPSHOT_DEFAULTS,
	BRIDGE_SNAPSHOT_KEYS,
	KERNEL_OWNED_KEYS,
	SNAPSHOT_KEYS,
	describeSnapshotWireDrift,
	withAdditiveSnapshotDefaults,
} from './snapshot-wire-shape.model';
export type { WireDriftOptions } from './snapshot-wire-shape.model';

/**
 * Events the native module emits. The payload of each is a JSON string.
 *
 * The core never pushes a snapshot the JavaScript side already holds: it
 * emits the new `revision` and a mounted subscriber pulls with
 * `getSnapshot()`.
 */
export const NATIVE_EVENT_NAMES = ['initialized', 'snapshot', 'error'] as const;

/**
 * One of {@link NATIVE_EVENT_NAMES}.
 */
export type NativeEventName = (typeof NATIVE_EVENT_NAMES)[number];

/**
 * Name the native cores register the TurboModule under, and the name the
 * JavaScript side looks it up by. It is the single agreed identifier between
 * the Codegen spec, the Swift module, and the Android module.
 */
export const NATIVE_INTH_MODULE_NAME = 'Inth';
