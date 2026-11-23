/**
 * `@inth/react-native` — React Native bindings for the Inth native consent
 * cores.
 *
 * The consent kernel runs natively: Swift on iOS, Kotlin on Android. This
 * package owns the boundary and nothing else. It reads the native snapshot,
 * forwards the subject's decisions, and renders what the core says. It does not
 * evaluate policy, store records, queue writes, or keep a second copy of consent
 * state in JavaScript.
 *
 * Three layers, top down:
 *
 * - {@link InthProvider} attaches to the native instance the app already booted,
 *   checks the protocol handshake, and presents the native consent prompt when
 *   one is owed (`autoPresent={false}` turns that off).
 * - The read hooks ({@link useSnapshot}, {@link useConsent},
 *   {@link useConsentStatus}, {@link useConsentSelector}) subscribe to the slice a component actually
 *   reads, so a consent change rerenders the components whose value moved.
 *   The action hooks ({@link useSaveConsents}, {@link useIdentify},
 *   {@link useSetOverrides}, {@link useDismissNotice},
 *   {@link useConsentActions}) forward decisions to the native core.
 * - The headless components (`ConsentGate`, `ConsentReady`, `ConsentPrompt`)
 *   call a function with that slice, for apps that build their own UI.
 *
 * @example
 * ```tsx
 * import {
 *     InthProvider,
 *     ConsentGate,
 *     useConsent,
 *     useSaveConsents,
 * } from '@inth/react-native';
 *
 * function Analytics() {
 *     const allowed = useConsent('measurement');
 *
 *     return allowed ? <VendorInit /> : null;
 * }
 * ```
 */

export {
	ConsentBanner,
	ConsentDialog,
	ConsentIabDrawer,
	ConsentPreferences,
	CONSENT_APPEARANCES,
	CONSENT_COLOR_SCHEMES,
	CONSENT_FIRST_LAYERS,
	CONSENT_SAVE_PLACEMENTS,
	CONSENT_THEME_PARTS,
	consentColorsFor,
	createConsentTheme,
	defaultConsentTheme,
	isConsentThemePart,
	resolveConsentColorScheme,
	resolveConsentTypeRoles,
	seedConsentIabSelection,
	useConsentStyles,
} from './components';
export type {
	ConsentBannerProps,
	ConsentAppearance,
	ConsentColorScheme,
	ConsentFirstLayer,
	ConsentSavePlacement,
	ConsentDialogProps,
	ConsentPartStyles,
	ConsentPreferencesProps,
	ConsentIabCopy,
	ConsentIabCopyOverrides,
	ConsentIabDialogData,
	ConsentIabDisplayConsentRow,
	ConsentIabDisplayModel,
	ConsentIabDrawerRootProps,
	ConsentIabDisplayRow,
	ConsentIabDisplayRowKind,
	ConsentIabDisplayStackRow,
	ConsentIabDisplayToggle,
	ConsentIabInitialSelection,
	ConsentIabProcessedFeature,
	ConsentIabProcessedPurpose,
	ConsentIabProcessedSpecialFeature,
	ConsentIabProcessedStack,
	ConsentIabProcessedVendor,
	ConsentIabSelection,
	ConsentIabTab,
	ConsentIabVendorId,
	ConsentStyles,
	ConsentTheme,
	ConsentNativeSlot,
	ConsentNativeSlotStyle,
	ConsentNativeThemeColors,
	ConsentThemeColorOptions,
	ConsentThemeColors,
	ConsentThemeMotion,
	ConsentThemeOptions,
	ConsentThemePart,
	ConsentThemeRadius,
	ConsentThemeSpacing,
	ConsentFontName,
	ConsentThemeTypography,
	ConsentTypeRoles,
	ConsentTypeStyle,
} from './components';
export { ConsentGate, ConsentPrompt, ConsentReady } from './headless';
export type {
	ConsentGateProps,
	ConsentGateState,
	ConsentPromptProps,
	ConsentPromptState,
	ConsentReadyProps,
	ConsentReadyState,
} from './headless';
export { useInthBootstrap, useGPPString, useSnapshot } from './hooks';
export { useWebViewConsent } from './webview/use-webview-consent';
export type {
	UseWebViewConsentOptions,
	WebViewConsentMessageEvent,
	WebViewConsentProps,
	WebViewConsentTarget,
} from './webview/use-webview-consent';
export {
	useConsentActions,
	useDismissNotice,
	useIdentify,
	useSaveConsents,
	useSetOverrides,
} from './hooks';
export type { ConsentActions, SaveConsentsInput } from './hooks';
export { ConsentDraftProvider, useConsentDraft } from './draft';
export {
	useAdTechProviderConsent,
	useIAB,
	useIABEnabled,
	useIABSnapshot,
	usePurposeConsent,
	useSpecialFeatureOptIn,
	useTCString,
	useVendorConsent,
} from './hooks';
export type { IABDraftHandle } from './hooks';
export type {
	ConsentDraftHandle,
	ConsentDraftProviderProps,
	ConsentDraftState,
} from './draft';
export { useConsentSelector } from './hooks';
export { useConsentStatus } from './hooks';
export { useConsentSafeArea } from './hooks';
export type { ConsentSafeArea } from './hooks';
export { useConsent, useConsentDecision } from './hooks';
export { useIsTrackingAllowed, useTrackingAuthorization } from './hooks';
export { useTrackingRequest } from './hooks';
export type {
	TrackingRequest,
	TrackingRequestPreferences,
	UseTrackingRequestOptions,
} from './hooks';
export {
	DEFAULT_TRACKING_CATEGORIES,
	isAdditionalInformationPause,
	MAX_TRACKING_REQUEST_TURNS,
	mayAskPlatformAgain,
} from './lib/tracking-journey.model';
export {
	denyAllSnapshot,
	INVALID_NATIVE_SNAPSHOT_CODE,
} from './lib/deny-all-snapshot';
export {
	isPlatformTrackingSatisfied,
	isTrackingPermitted,
} from './lib/tracking-permission.model';
export {
	categoryDecision,
	isCategoryAllowed,
	isConsentStatusEqual,
	isSnapshotReady,
	isPromptOwed,
	isStatusPromptOwed,
	selectConsentStatus,
	shallowEqual,
} from './lib/consent-selectors.model';
export type { ConsentDecision, ConsentStatus } from './lib/consent-selectors.model';
export {
	InthProtocolMismatchError,
	createConsentClient,
	getConsentClient,
	getNativeInth,
	getNativeInthEvents,
	hasNativeInthSurface,
	NativeBridgeError,
	NativeInthUnavailableError,
} from './native';
export type {
	ConsentClient,
	NativeInthTurboModule,
	NativeEventSubscription,
	NativeEventsLike,
	SnapshotEquality,
	SnapshotSelector,
} from './native';
export * from './protocol';
export {
	InthProvider,
	ConsentClientContext,
	useConsentClient,
} from './provider';
export type {
	InthProviderBaseProps,
	InthProviderPromptProps,
	InthProviderProps,
	ConsentTrackingReprompt,
	ConsentTrackingRequest,
} from './provider';
export type { ConsentSafeAreaInsets } from './provider';

// The Codegen spec is exported as types only. Importing it for values would
// resolve the TurboModule at import time, which only works inside a React
// Native runtime with the New Architecture enabled.
export type { Spec as NativeInthSpec } from './specs/NativeInth';
export {
	closeConsentPresenter,
	onConsentPresenterOutcome,
	parseConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
} from './native/presenter';
export type {
	ConsentPresenterOutcome,
	ConsentPresenterSession,
} from './native/presenter';
