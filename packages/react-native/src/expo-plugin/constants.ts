/**
 * Fixed names and floors the plugin writes into the native projects.
 *
 * These two tables are the whole surface between the plugin and the embedded
 * cores, so they are transcribed from the readers rather than invented:
 * `InthBridgeConfiguration.InfoPlistKey` in `ios/InthReactNative/Bridge/`
 * for iOS, and `InthAndroid` plus `InthReactNativeBootstrap` on Android. The
 * platforms spell the same idea differently because the readers already did,
 * and a plugin that "cleaned that up" would write keys nothing reads.
 *
 * Every entry here must have a named reader on its platform, and
 * `__tests__/native-key-readers.test.ts` fails the build when one does not.
 * A key in an `Info.plist` or an `AndroidManifest.xml` looks like configuration
 * to everyone who reads the build, and a value no code reads is a wrong
 * promise rather than a spare knob, so neither table keeps one "for later".
 */

/** Android `<meta-data>` names the plugin writes, in full. */
export const ANDROID_META = {
	/** Present only when the host bootstraps the core itself. */
	autoBootstrap: 'com.inth.reactnative.AUTO_BOOTSTRAP',
	/** Inth project URL, the value the core calls `backendUrl`. */
	backendUrl: 'com.inth.BACKEND_URL',
	/** Comma-separated category ids the app offers, read by `InthAndroid`. */
	categories: 'com.inth.CATEGORIES',
	/** Value sent as the `domain` field of `POST /subjects`. */
	domain: 'com.inth.BACKEND_DOMAIN',
	/** `true` drops consent records instead of sending them. Debug builds only. */
	dryRun: 'com.inth.DRY_RUN',
	/** Staged-build switch that forces GPC on. */
	forceGpc: 'com.inth.FORCE_GPC',
	/** `true` turns on the IAB GPP string, read by `InthAndroid.declaredGpp`. */
	gpp: 'com.inth.GPP',
	/** MSPA mode, `opt-out-option` or `service-provider`. */
	gppMspaMode: 'com.inth.GPP_MSPA_MODE',
	/** Comma-separated categories whose refusal reports a GPP opt-out. */
	gppOptOutCategories: 'com.inth.GPP_OPT_OUT_CATEGORIES',
	/** `false` leaves the TCF EU section out of the GPP string. */
	gppTcf: 'com.inth.GPP_TCF',
	/** Registered IAB CMP ID, read by `InthAndroid.declaredIab`. */
	iabCmpId: 'com.inth.IAB_CMP_ID',
	/** CMP version, required with the CMP ID. */
	iabCmpVersion: 'com.inth.IAB_CMP_VERSION',
	/** Optional TCF consent screen number. */
	iabConsentScreen: 'com.inth.IAB_CONSENT_SCREEN',
	/** Two-letter publisher country code, required with the CMP ID. */
	iabPublisherCountryCode: 'com.inth.IAB_PUBLISHER_COUNTRY_CODE',
	policyResource: 'com.inth.POLICY_RESOURCE',
	/** Asset path of the in-code policy. */
	policyRules: 'com.inth.POLICY_RULES',
	/**
	 * Comma-separated IAB vendor ids the app may disclose, read by `InthAndroid`.
	 *
	 * The Android spelling of the `iab.vendors` array a web host passes to its
	 * provider. It stays a string because Android `<meta-data>` has no list type;
	 * iOS gets the same declaration as a plist array under its own key.
	 */
	vendors: 'com.inth.VENDORS',
} as const;

/** iOS `Info.plist` keys, matching `InthBridgeConfiguration.InfoPlistKey`. */
export const IOS_PLIST_KEY = {
	/** Present only when the host bootstraps the core itself. */
	autoBootstrap: 'com.inth.reactnative.AutoBootstrap',
	/** Category id array the app offers, read by the iOS bridge. */
	categories: 'com.inth.categories',
	/** Value sent as the `domain` field of `POST /subjects`. */
	domain: 'com.inth.backend.domain',
	/** `true` drops consent records instead of sending them, as a real Boolean. */
	dryRun: 'com.inth.dryRun',
	/** Staged-build switch that forces GPC on, as a real Boolean. */
	forceGPC: 'com.inth.forceGPC',
	/** `true` turns on the IAB GPP string, as a real Boolean. */
	gpp: 'com.inth.gpp',
	/** MSPA mode, `opt-out-option` or `service-provider`. */
	gppMspaMode: 'com.inth.gpp.mspaMode',
	/** Category id array whose refusal reports a GPP opt-out. */
	gppOptOutCategories: 'com.inth.gpp.optOutCategories',
	/** `false` leaves the TCF EU section out of the GPP string, as a real Boolean. */
	gppTCF: 'com.inth.gpp.tcf',
	/** Registered IAB CMP ID, as a plist integer. */
	iabCmpId: 'com.inth.iab.cmpId',
	/** CMP version, as a plist integer. */
	iabCmpVersion: 'com.inth.iab.cmpVersion',
	/** Optional TCF consent screen number, as a plist integer. */
	iabConsentScreen: 'com.inth.iab.consentScreen',
	/** Two-letter publisher country code. */
	iabPublisherCountryCode: 'com.inth.iab.publisherCountryCode',
	policyResource: 'com.inth.policy.resource',
	/** Bundle filename of the in-code policy. */
	policyRules: 'com.inth.policy.rules',
	/** Inth project URL. */
	projectUrl: 'com.inth.backend.url',
	/**
	 * Comma-separated IAB vendor ids the app may disclose, read by the iOS bridge.
	 *
	 * A string rather than a number array so one declaration spells the same list on
	 * both platforms; the bridge's `declaredVendors` accepts a bare number too.
	 */
	vendors: 'com.inth.vendors',
} as const;

/**
 * Meta-data names earlier versions wrote. The native cores refuse them, so
 * prebuild removes them from a manifest that was not regenerated.
 */
export const RETIRED_ANDROID_META_KEYS: readonly string[] = [
	'com.inth.MODE',
	'com.inth.BACKEND_INIT_URL',
];

/** `Info.plist` keys earlier versions wrote, removed for the same reason. */
export const RETIRED_IOS_PLIST_KEYS: readonly string[] = [
	'com.inth.backend.mode',
	'com.inth.backend.initUrl',
];

/** androidx.startup provider the app manifest declares. */
export const ANDROID_STARTUP_PROVIDER =
	'androidx.startup.InitializationProvider';

/** Authority suffix androidx.startup requires on its provider. */
export const ANDROID_STARTUP_AUTHORITY_SUFFIX = '.androidx-startup';

/** The literal every androidx.startup `<meta-data>` value must carry. */
export const ANDROID_STARTUP_META_VALUE = 'androidx.startup';

/**
 * The initializer that starts Inth before the first Activity exists.
 *
 * The bridge registers it, so the core is hydrated before the first JavaScript
 * frame. The plain Android library ships an equivalent one and either winning
 * is correct, because `Inth.bootstrap` ignores a second call.
 */
export const ANDROID_INITIALIZER =
	'com.inth.reactnative.InthReactNativeInitializer';

/** Consent writes are network writes, so the app needs this permission. */
export const ANDROID_INTERNET_PERMISSION = 'android.permission.INTERNET';

/**
 * `minSdk` the shipped AARs compile against.
 *
 * From `packages/android/gradle/libs.versions.toml`. An app below this
 * fails in the manifest merger with a message that names neither Inth nor this
 * number, so the plugin raises it instead.
 */
export const MIN_ANDROID_MIN_SDK = 24;

/** `compileSdk` the shipped AARs compile against, same source as above. */
export const MIN_ANDROID_COMPILE_SDK = 36;

/** Key under `extra` that carries the same values to JavaScript. */
export const EXTRA_KEY = 'inth';

/** Name recorded in the plugin history so the plugin never runs twice. */
export const PLUGIN_NAME = '@inth/react-native/expo-plugin';

/**
 * Category ids a host may declare, the same list the web provider accepts as
 * `consentCategories`.
 *
 * Transcribed the way the key tables above are: from `ConsentCategory` in both
 * native cores and `CONSENT_CATEGORIES` in the package's own protocol
 * vocabulary. The cores drop a name outside this list rather than trusting it,
 * so the plugin refuses it at prebuild instead of shipping a declaration that
 * silently narrows to fewer rows than the host typed.
 */
export const CONSENT_CATEGORY_IDS = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

/** One declared consent category id. */
export type InthConsentCategoryId = (typeof CONSENT_CATEGORY_IDS)[number];

/**
 * Shape Apple accepts for an SKAdNetwork identifier.
 *
 * Apple's prose says 11 characters and its published partner list carries both
 * 10 and 11 (`cstr6suwn9.skadnetwork` and `l9udre998ab.skadnetwork`), so the
 * check accepts either. It is here to catch a host pasting a URL or an app id,
 * not to out-rule Apple's registry.
 */
export const SK_AD_NETWORK_IDENTIFIER_PATTERN =
	/^[a-z0-9]{10,11}\.skadnetwork$/iu;

/**
 * Shape of a locale tag the plugin will write a localized string for.
 *
 * The tag is not only a label: it names the `<locale>.lproj` bundle the string
 * lands in, so a separator in one would put a file somewhere the build never
 * reads. This accepts what Xcode writes a bundle for (`de`, `en-GB`, `zh-Hans`,
 * `pt_BR`, `Base`) and refuses everything that is not a single flat token.
 */
export const LOCALE_TAG_PATTERN = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/u;

/** Every AndroidManifest meta-data name the plugin writes for IAB TCF. */
export const ANDROID_IAB_META_KEYS: readonly string[] = [
	ANDROID_META.iabCmpId,
	ANDROID_META.iabCmpVersion,
	ANDROID_META.iabConsentScreen,
	ANDROID_META.iabPublisherCountryCode,
];

/** Every Info.plist key the plugin writes for IAB TCF. */
export const IOS_IAB_PLIST_KEYS: readonly string[] = [
	IOS_PLIST_KEY.iabCmpId,
	IOS_PLIST_KEY.iabCmpVersion,
	IOS_PLIST_KEY.iabConsentScreen,
	IOS_PLIST_KEY.iabPublisherCountryCode,
];

/**
 * The `com.inth.GPP_OPT_OUT_CATEGORIES` value for an empty list. Android
 * meta-data has no reliably empty value, so `InthAndroid.declaredGpp` reads
 * this word, or a blank value, as "no category drives the opt-outs".
 */
export const GPP_NO_OPT_OUT_CATEGORIES = 'none';

/** Every AndroidManifest meta-data name the plugin writes for GPP. */
export const ANDROID_GPP_META_KEYS: readonly string[] = [
	ANDROID_META.gpp,
	ANDROID_META.gppMspaMode,
	ANDROID_META.gppOptOutCategories,
	ANDROID_META.gppTcf,
];

/** Every Info.plist key the plugin writes for GPP. */
export const IOS_GPP_PLIST_KEYS: readonly string[] = [
	IOS_PLIST_KEY.gpp,
	IOS_PLIST_KEY.gppMspaMode,
	IOS_PLIST_KEY.gppOptOutCategories,
	IOS_PLIST_KEY.gppTCF,
];
