import type { ResolvedBundleManifest } from './bundle-manifest';
import {
	CONSENT_CATEGORY_IDS,
	LOCALE_TAG_PATTERN,
	SK_AD_NETWORK_IDENTIFIER_PATTERN,
} from './constants';
import type { ConsentCategoryId } from './constants';
import { InthPluginError } from './errors';
import { resolveAndroidMavenRepository } from './maven';
import type { InthAndroidMavenRepository } from './maven';
import { normalizeProjectUrl, ProjectUrlError } from './project-url';
import type { InthThemePluginProps } from './theme';

/**
 * One locale's Markdown prompt copy, ready to write into a string table.
 *
 * `locale` doubles as the `.lproj` bundle's name, which is why
 * {@link LOCALE_TAG_PATTERN} gates it in `resolveParams`.
 */
export interface InthTrackingMarkdownLocalization {
	/** Locale tag as Xcode spells it, for example `fr-CA`. */
	readonly locale: string;
	/** Markdown prompt copy, trimmed. */
	readonly value: string;
}

/**
 * IAB TCF settings for the embedded cores.
 *
 * Setting these turns IAB TCF on: the core writes `IABTCF_CmpSdkID` and
 * `IABTCF_CmpSdkVersion` at startup and can commit IAB choices. There is no
 * default CMP ID, so `cmpId` must be the ID IAB Europe registered for your CMP.
 */
export interface InthIabPluginProps {
	/** Registered CMP ID, a whole number from 2 to 4095. */
	cmpId: number;
	/** Your CMP version, a whole number from 0 to 4095. */
	cmpVersion: number;
	/** Two-letter country code of the publisher, such as `DE`. */
	publisherCountryCode: string;
	/**
	 * TCF consent screen number, a whole number from 0 to 63.
	 *
	 * @defaultValue 1
	 */
	consentScreen?: number;
}

/** MSPA mode for covered GPP transactions. */
export type InthGppMspaMode = 'opt-out-option' | 'service-provider';

/**
 * IAB GPP options: the ones web Inth's `gpp` option takes that apply on a
 * device. `true` turns GPP on with the defaults.
 */
export interface InthGppPluginProps {
	/**
	 * MSPA mode. Set it only if you signed the IAB Multi-State Privacy
	 * Agreement; the transaction is then reported as covered.
	 */
	mspaMode?: InthGppMspaMode;
	/**
	 * Categories whose refusal reports an opt-out of sale, sharing and
	 * targeted advertising. `[]` means no category drives them, so they read
	 * "did not opt out", as on web and in the Swift and Kotlin APIs.
	 * `necessary` is always granted, so it never drives them.
	 *
	 * @defaultValue ['marketing']
	 */
	optOutCategories?: readonly ConsentCategoryId[];
	/**
	 * Include the TCF EU section under an `iab` policy.
	 *
	 * @defaultValue true
	 */
	tcf?: boolean;
}

/** Validated GPP options. */
export interface ResolvedInthGppParams {
	/** `null` reports the transaction as not covered and writes no key. */
	readonly mspaMode: InthGppMspaMode | null;
	/**
	 * `null` when the option was not set: no key is written and the cores use
	 * their default, `marketing`. A list, empty included, is written as given.
	 */
	readonly optOutCategories: readonly ConsentCategoryId[] | null;
	readonly tcf: boolean;
}

/** Validated IAB settings. */
export interface ResolvedInthIabParams {
	readonly cmpId: number;
	readonly cmpVersion: number;
	/** Uppercase two-letter code. */
	readonly publisherCountryCode: string;
	/** `null` keeps the core's default of 1 and writes no key. */
	readonly consentScreen: number | null;
}

/** Optional categories a policy rule can name. `necessary` is tolerated and dropped. */
export type InCodePolicyCategory = ConsentCategoryId;

/**
 * Where a policy rule applies, in the backend's `PolicyMatch` names.
 *
 * Precedence follows the backend: region, then country, then `regionFallbacks`
 * for a country without a region, then the `fallback` rule for an unknown
 * location, then the `isDefault` rule.
 */
export interface InCodePolicyMatch {
	regions?: readonly { country: string; region: string }[];
	countries?: readonly string[];
	regionFallbacks?: readonly string[];
	isDefault?: boolean;
	fallback?: boolean;
}

/**
 * One rule of the in-code policy, in the backend's `PolicyRule` names.
 *
 * It is the same shape `@c15t/backend` reads, minus `iab`, because the vendor
 * list comes from `/init`, and minus the `rights`, `proof`, `i18n` and
 * `legacyMaterial` fields, which the device does not read.
 */
export interface InCodePolicyRule {
	id: string;
	match: InCodePolicyMatch;
	model: 'opt-in' | 'opt-out' | 'none';
	prompt: 'choice' | 'notice' | 'none';
	/** Optional categories in scope. Omitted or `'*'` means every optional category. */
	categories?: readonly InCodePolicyCategory[] | readonly ['*'];
	/** How categories outside `categories` behave. Required for a partial scope. */
	scopeMode?: 'strict' | 'permissive';
	/** Categories the preference form preselects. Inside `categories`. */
	preselectedCategories?: readonly InCodePolicyCategory[];
	/** Actions a choice prompt offers. `accept` and `reject` are always offered. */
	actions?: readonly ('accept' | 'reject' | 'customize')[];
	/** Validity in days, fractions allowed. Defaults to 365. */
	validity?: { choiceDays?: number; noticeDays?: number };
	/** Categories an active Global Privacy Control signal denies. */
	privacySignals?: {
		gpc?: { denyCategories: readonly InCodePolicyCategory[] };
	};
	/** Bump it when the wording a person agreed to changes; they are asked again. */
	copyRevision?: string;
}

/** The in-code policy: rules the device resolves itself, without `/init`. */
export interface InCodePolicy {
	rules: readonly InCodePolicyRule[];
}

/**
 * Parameters accepted by `@inth/react-native/expo-plugin` in `app.json`.
 *
 * Everything here is published inside the app binary, so nothing here may be a
 * secret. There is no credential parameter: the embedded cores identify a
 * project by backend URL and send no key, so nothing here has anywhere to put
 * one. See `packages/native-protocol/CONTRACT.md`.
 */
export interface InthPluginProps {
	/** Explicit binary repository. Omit only when the host configures Maven itself. There is no default repository. */
	androidMavenRepository?: InthAndroidMavenRepository;
	/** Path to a build-exported native policy JSON, relative to the Expo project. */
	policyResource?: string;
	/**
	 * Fetch the latest manifest from `projectUrl` at prebuild and bundle it, so a
	 * first launch with no network still shows the prompt. With `dryRun`, the
	 * command gets `--dry-run` and takes the same relaxed URL rule.
	 *
	 * Runs `c15t mobile-manifest` from the app's `@c15t/cli` dev dependency. If
	 * the fetch fails, a release build fails and a debug build warns and
	 * continues. Only `expo run:*` without a release variant counts as debug;
	 * set `INTH_MANIFEST_BUILD` to `release` or `debug` to say so explicitly.
	 * Replaces `policyResource`.
	 */
	bundleManifest?:
		| true
		| {
				/** Reuse the last fetched copy when the fetch fails, as air-gapped CI needs. */
				allowStaleManifest?: boolean;
				/** Days until devices report `policyStale`. Defaults to 30. */
				expiresInDays?: number;
				/** Languages to compile prompt copy for. English is always included. */
				languages?: readonly string[];
				/**
				 * Where the fetched copy is kept, relative to the Expo project.
				 *
				 * @defaultValue 'inth-policy.json'
				 */
				out?: string;
		  };
	/**
	 * Policy rules kept in source control. The device resolves them itself and
	 * never calls `/init`; consent records still go to `projectUrl`.
	 *
	 * The device has no location without `/init`, so the `fallback` rule applies
	 * unless the app sets an override country and region. Cannot be combined
	 * with `policyResource`, `bundleManifest` or `iab`.
	 */
	policy?: InCodePolicy;
	/**
	 * The project URL from your Inth dashboard, such as
	 * `https://your-project.inth.app`. Required.
	 *
	 * The mobile SDKs work only with Inth, so the host must be a project host
	 * under `inth.app`, with no port or path. `dryRun` relaxes
	 * that.
	 */
	projectUrl: string;
	/**
	 * Development and CI switch: consent works as normal on the device, and
	 * consent records are dropped instead of sent.
	 *
	 * It also relaxes the `projectUrl` rule to any `https` URL, or `http` on
	 * `localhost`, `127.0.0.1` or `[::1]`. A release build refuses to start
	 * Inth with `dryRun` on, so remove it before you ship.
	 *
	 * @defaultValue false
	 */
	dryRun?: boolean;
	/**
	 * The `property` each consent record names. Defaults to the iOS bundle
	 * identifier and the Android application ID. Sent lowercase.
	 */
	property?: string;
	/**
	 * The consent categories this app offers, the mobile spelling of the
	 * `consentCategories` a web host passes to its provider.
	 *
	 * The declaration only narrows the optional half of the resolved policy
	 * scope: a surface lists `necessary` plus the scope the policy governs that
	 * this list also names, so the same backend and the same declaration render
	 * the same rows on web and mobile. Omit it to declare none: a strict policy
	 * then offers its full scope and a permissive one offers `necessary` alone.
	 */
	consentCategories?: readonly ConsentCategoryId[];
	/**
	 * The IAB vendor ids this app may disclose, the mobile spelling of the
	 * `iab.vendors` array a web host passes to its provider.
	 *
	 * The declaration narrows the vendor drawer only: the vendor list this app
	 * is served keeps the purposes, features, stacks, and both version numbers
	 * the policy was graded against, so a scoped app can still explain what
	 * purpose 7 means. Omit it to disclose every vendor the backend serves.
	 */
	vendors?: readonly number[];
	/**
	 * IAB TCF CMP identity and publisher settings.
	 *
	 * Omit it to leave IAB TCF off. `vendors` only narrows disclosures and does
	 * not turn IAB on.
	 */
	iab?: InthIabPluginProps;
	/**
	 * IAB GPP: the GPP string on the snapshot (`useGPPString()`) and the
	 * `IABGPP_*` keys ad SDKs read. US visitors under a rule that offers an
	 * opt-out get the US National section; an `iab` rule gets the TCF EU
	 * section. Omit it to leave GPP off.
	 */
	gpp?: boolean | InthGppPluginProps;
	/**
	 * Write the App Tracking Transparency usage description and SKAdNetwork
	 * items.
	 *
	 * Opt-in and never implied: consent to marketing cookies is not Apple
	 * tracking authorization, and a binary that asks for ATT without needing it
	 * is an App Review problem.
	 *
	 * @defaultValue false
	 */
	enableAppTrackingTransparency?: boolean;
	/**
	 * Value for `NSUserTrackingUsageDescription`, the prompt the user sees.
	 *
	 * Required when ATT is enabled. Apple rejects a generic string, so the
	 * plugin will not invent one.
	 */
	trackingUsageDescription?: string;
	/**
	 * Value for `NSUserTrackingMarkdownUsageDescription`, the expanded European
	 * Union prompt Apple shows in place of the plain one.
	 *
	 * Apple renders it as Markdown: bold, italics, bullet lists, and paragraph
	 * breaks, but no underline. It is optional, and Apple's own region gate picks
	 * who sees it: iOS and iPadOS 27.2 or later, with the device and the signed-in
	 * Apple Account both inside one of the countries Apple enabled it for.
	 * Everywhere else, and on every older system, Apple shows
	 * {@link trackingUsageDescription} instead, which is why the plain key stays
	 * written whenever the App Tracking Transparency opt-in is on. This parameter
	 * never replaces it.
	 *
	 * The copy belongs to a sheet Apple draws: it is compiled into the app binary,
	 * no Inth surface reads it back, and Inth cannot decide when it appears. What
	 * Inth does control is the in-app preference centre, whose copy and styling are
	 * plain text and stay the host's to write.
	 *
	 * A blank value is refused rather than written. Apple answers an empty
	 * `NSUserTrackingMarkdownUsageDescription` with the plain description, so a
	 * blank one builds a binary whose author meant to localize the prompt and did
	 * not.
	 */
	trackingMarkdownUsageDescription?: string;
	/**
	 * Per-locale values for {@link trackingMarkdownUsageDescription}.
	 *
	 * iOS localizes a prompt string through `InfoPlist.strings` inside each
	 * `<locale>.lproj` bundle, because `Info.plist` holds one value per key, so
	 * these go into the bundle rather than into the plist per locale. Each key is a
	 * locale tag as Xcode spells it (`de`, `fr-CA`, `zh-Hans`), and each value is
	 * Markdown in the same grammar as the base string.
	 *
	 * A bundle that already declares the key keeps the host's entry, and every
	 * other entry in the same file is left alone. The base value stays optional:
	 * a locale not named here gets the app's own localization of the key, and with
	 * no base value that is {@link trackingUsageDescription}.
	 */
	trackingMarkdownUsageDescriptionLocalizations?: Readonly<
		Record<string, string>
	>;
	/**
	 * SKAdNetwork identifiers to register, written only when ATT is enabled.
	 *
	 * Each must look like `cstr6suwn9.skadnetwork`.
	 */
	skAdNetworkIdentifiers?: readonly string[];
	/**
	 * Domains to declare in `NSPrivacyTrackingDomains`.
	 *
	 * Defaults to the backend host when ATT is enabled. Accepted only with ATT
	 * enabled, because a tracking domain without a tracking prompt is a
	 * declaration the plugin cannot justify on the host's behalf.
	 */
	privacyTrackingDomains?: readonly string[];
	/**
	 * Force the Global Privacy Control signal on for a staged build.
	 *
	 * @defaultValue false
	 */
	forceGPC?: boolean;
	/**
	 * Let the embedded core start itself at launch.
	 *
	 * Set `false` when the native app installs Inth itself before React Native
	 * starts.
	 *
	 * @defaultValue true
	 */
	autoBootstrap?: boolean;
	/**
	 * Skip the check that the project is building a custom native client.
	 *
	 * For a build harness that drives `expo start` in a container without ever
	 * opening Expo Go.
	 *
	 * @defaultValue false
	 */
	skipNativeBuildCheck?: boolean;
	/**
	 * Appearance of the native consent screens, written into the native theme
	 * keys at prebuild. Field names follow the web `Theme` from `@inth/sdk/ui`.
	 * Omit it to leave those keys to the app.
	 */
	theme?: InthThemePluginProps;
	/**
	 * `false` builds without the stock native consent screens, for an app that
	 * renders its own consent UI with the headless hooks. The iOS pod drops the
	 * SwiftUI screens and the Android build drops `inth-consent-ui`;
	 * `presentConsentPrompt` and `presentPreferences` reject with
	 * `INTH_NATIVE_UI_EXCLUDED`. Cannot be combined with `theme`.
	 *
	 * @defaultValue true
	 */
	nativeUI?: boolean;
}

/** Validated parameters, with defaults applied. */
export interface ResolvedInthParams {
	/** Validated build-only repository. Never copied into extra.inth or native runtime configuration. */
	readonly androidMavenRepository: InthAndroidMavenRepository | null;
	readonly policyResource: string | null;
	/** Build-time manifest fetch settings, or `null` when the plugin fetches nothing. */
	readonly bundleManifest: ResolvedBundleManifest | null;
	/** The in-code policy rules, or `null` when the policy comes from `/init`. */
	readonly policyRules: readonly InCodePolicyRule[] | null;
	/** The project URL in its normal form, without a trailing slash. */
	readonly projectUrl: string;
	/** Hostname of {@link projectUrl}, used for the iOS privacy manifest. */
	readonly backendHost: string;
	/** Whether consent records are dropped instead of sent. */
	readonly dryRun: boolean;
	/** `property` for consent records, or `null` to let the core derive it. */
	readonly property: string | null;
	/**
	 * Category ids the app declares, de-duplicated; empty means no declaration.
	 *
	 * Written as the `com.inth.categories` plist array and the comma-separated
	 * `com.inth.CATEGORIES` meta-data. Absent keys are the no-declaration answer,
	 * so the empty list is written nowhere rather than as an empty value.
	 */
	readonly consentCategories: readonly ConsentCategoryId[];
	/**
	 * Vendor ids the app declares, de-duplicated; empty means no declaration.
	 *
	 * Written as the `com.inth.vendors` plist string and the comma-separated
	 * `com.inth.VENDORS` meta-data. Absent keys are the full-disclosure answer,
	 * so the empty list is written nowhere rather than as an empty value. Both
	 * embedded cores also prune whatever they are served down to this list, so a
	 * backend that ignores the declaration still cannot widen the drawer.
	 */
	readonly vendors: readonly number[];
	/** IAB settings, or `null` when IAB TCF stays off. */
	readonly iab: ResolvedInthIabParams | null;
	/** GPP options, or `null` when GPP stays off. */
	readonly gpp: ResolvedInthGppParams | null;
	/** App Tracking Transparency opt-in, resolved. */
	readonly appTrackingTransparency: {
		readonly enabled: boolean;
		/**
		 * Base `NSUserTrackingMarkdownUsageDescription`, or `null` to let Apple fall
		 * back to {@link usageDescription}.
		 */
		readonly markdownUsageDescription: string | null;
		/**
		 * Per-locale Markdown prompt copy, in the order the host wrote it.
		 *
		 * Written into each `<locale>.lproj/InfoPlist.strings`, never into the plist.
		 */
		readonly markdownUsageDescriptionLocalizations: readonly InthTrackingMarkdownLocalization[];
		readonly usageDescription: string | null;
		readonly skAdNetworkIdentifiers: readonly string[];
	};
	/** Domains for `NSPrivacyTrackingDomains`; empty unless ATT is enabled. */
	readonly privacyTrackingDomains: readonly string[];
	/** Whether GPC is forced on for this build. */
	readonly forceGPC: boolean;
	/** Whether the embedded core starts itself at launch. */
	readonly autoBootstrap: boolean;
	/** Whether the custom-native-build check is waived. */
	readonly skipNativeBuildCheck: boolean;
}

const USAGE =
	'configure it in app.json as ' +
	`{ "plugins": [["@inth/react-native", { "projectUrl": "https://your-project.inth.app" }]] }`;

/**
 * Options this plugin used to take, with what replaces each one.
 *
 * Props come from `app.json`, so the keys are checked at prebuild even though
 * the type no longer has them.
 */
const RETIRED_MODES: Readonly<Record<string, string>> = {
	custom:
		"mode 'custom' was removed. Set autoBootstrap to false: the native app " +
		'installs Inth itself before React Native starts. Custom transports ' +
		'are gone.',
	hosted:
		"mode 'hosted' was removed. Hosted is the only mode: remove mode and " +
		'keep projectUrl.',
	offline:
		"mode 'offline' was removed. Use dryRun: true for development and CI. " +
		'In production keep projectUrl; bundleManifest or an in-code policy ' +
		'covers a launch without network.',
	selfHosted:
		"mode 'selfHosted' was removed and has no replacement. The mobile SDKs " +
		'work only with Inth: remove mode and set projectUrl to your Inth ' +
		'project URL.',
};

const assertNoRetiredOptions = function assertNoRetiredOptions(
	props: InthPluginProps
): void {
	const given = props as { initURL?: unknown; mode?: unknown };
	if (given.mode !== undefined) {
		throw new InthPluginError(
			(Object.hasOwn(RETIRED_MODES, String(given.mode))
				? RETIRED_MODES[String(given.mode)]
				: undefined) ??
				`mode was removed; got ${JSON.stringify(given.mode)}. Hosted is ` +
					'the only mode: remove mode and set projectUrl to your Inth ' +
					'project URL.'
		);
	}
	if (given.initURL !== undefined) {
		throw new InthPluginError(
			'initURL was removed and has no replacement. Policy is fetched from ' +
				'projectUrl: remove initURL.'
		);
	}
};

/** The project URL in its normal form, or the plugin's error for a refused one. */
const resolveProjectUrl = function resolveProjectUrl(
	value: unknown,
	dryRun: boolean
): string {
	if (typeof value !== 'string') {
		throw new InthPluginError(`projectUrl is required. ${USAGE}`);
	}
	try {
		return normalizeProjectUrl(value, { relaxed: dryRun });
	} catch (error) {
		if (error instanceof ProjectUrlError) {
			throw new InthPluginError(error.message, error.reason);
		}
		throw error;
	}
};

/** `www.example.com` from the normal form, without a port. */
const hostOf = function hostOf(projectUrl: string): string {
	return new URL(projectUrl).hostname;
};

const normalizeOptionalText = function normalizeOptionalText(
	value: string | undefined,
	label: string
): string | null {
	if (value === undefined) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed === '' || /\s/u.test(trimmed)) {
		throw new InthPluginError(`${label} must be a single non-empty token.`);
	}
	return trimmed;
};

const normalizeTrackingDomain = function normalizeTrackingDomain(
	value: string
): string {
	const trimmed = value.trim();
	if (
		trimmed === '' ||
		/\s/u.test(trimmed) ||
		trimmed.includes('://') ||
		trimmed.includes('/') ||
		trimmed.includes(':')
	) {
		throw new InthPluginError(
			`privacyTrackingDomains entries must be bare hostnames such as ` +
				`"ads.example.com"; got ${JSON.stringify(value)}.`
		);
	}
	return trimmed.toLowerCase();
};

const normalizeConsentCategories = function normalizeConsentCategories(
	categories: readonly string[] | undefined
): ConsentCategoryId[] {
	if (categories === undefined) {
		return [];
	}
	if (categories.length === 0) {
		// An empty list means "no declaration" to both cores, which is the
		// policy's answer for an app that declares nothing, not an app that
		// offers nothing. Omitting the parameter says that honestly.
		throw new InthPluginError(
			'consentCategories must name at least one category. Omit it ' +
				'entirely when the app declares no categories.'
		);
	}
	const trimmed = categories.map((category) => category.trim());
	const unknown = [
		...new Set(
			trimmed.filter(
				(category) =>
					!(CONSENT_CATEGORY_IDS as readonly string[]).includes(category)
			)
		),
	];
	if (unknown.length > 0) {
		// Both cores drop an unknown name rather than trusting it, so writing it
		// would ship a declaration whose rows quietly differ from the list the
		// host typed. Refuse it while someone is still reading app.json.
		throw new InthPluginError(
			`consentCategories accepts only ` +
				`${CONSENT_CATEGORY_IDS.join(', ')}; unknown: ` +
				`${unknown.map((name) => JSON.stringify(name)).join(', ')}.`
		);
	}
	return [...new Set(trimmed)] as ConsentCategoryId[];
};

/**
 * Validate and de-duplicate a declared vendor scope.
 *
 * Ids are positive integers because that is what the IAB publishes and what both
 * cores parse; an entry that is not one is dropped by the readers rather than
 * trusted, so the plugin refuses it here instead of shipping a declaration whose
 * drawer quietly differs from the list someone typed into `app.json`.
 *
 * An id the served vendor list does not carry costs nothing: pruning a document
 * never adds an entry to satisfy a scope, so a custom or out-of-range id is
 * simply an id nobody is ever shown.
 */
const normalizeVendors = function normalizeVendors(
	vendors: readonly number[] | undefined
): number[] {
	if (vendors === undefined) {
		return [];
	}
	if (vendors.length === 0) {
		// An empty list means "no declaration" to both cores, which is every
		// vendor the backend serves: the opposite of what a host typing `[]`
		// looks like it means. Omitting the parameter says that honestly.
		throw new InthPluginError(
			'vendors must name at least one vendor id. Omit it entirely to ' +
				'disclose every vendor the backend serves.'
		);
	}
	const invalid = [
		...new Set(
			vendors.filter(
				(vendor) =>
					!Number.isInteger(vendor) || !Number.isFinite(vendor) || vendor <= 0
			)
		),
	];
	if (invalid.length > 0) {
		throw new InthPluginError(
			`vendors accepts positive integer IAB vendor ids; invalid: ` +
				`${invalid.map((vendor) => JSON.stringify(vendor)).join(', ')}.`
		);
	}
	return [...new Set(vendors)];
};

const isWholeNumberIn = function isWholeNumberIn(
	value: unknown,
	min: number,
	max: number
): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= min &&
		value <= max
	);
};

/**
 * Validate the IAB settings.
 *
 * The ranges are the ones both cores enforce before they write a CMP ID or
 * encode a TC String. Refusing here keeps a wrong CMP ID out of the binary.
 */
const normalizeIab = function normalizeIab(
	iab: InthIabPluginProps | undefined
): ResolvedInthIabParams | null {
	if (iab === undefined) {
		return null;
	}
	if (iab === null || typeof iab !== 'object') {
		throw new InthPluginError(
			'iab must be an object such as { "cmpId": 123, "cmpVersion": 1, ' +
				'"publisherCountryCode": "DE" }. Omit it to leave IAB TCF off.'
		);
	}
	if (!isWholeNumberIn(iab.cmpId, 2, 4095)) {
		throw new InthPluginError(
			`iab.cmpId must be the CMP ID IAB Europe registered for your CMP, a ` +
				`whole number from 2 to 4095. There is no default. Got ` +
				`${JSON.stringify(iab.cmpId)}.`
		);
	}
	if (!isWholeNumberIn(iab.cmpVersion, 0, 4095)) {
		throw new InthPluginError(
			`iab.cmpVersion must be a whole number from 0 to 4095. Got ` +
				`${JSON.stringify(iab.cmpVersion)}.`
		);
	}
	const country =
		typeof iab.publisherCountryCode === 'string'
			? iab.publisherCountryCode.trim().toUpperCase()
			: '';
	if (!/^[A-Z]{2}$/u.test(country)) {
		throw new InthPluginError(
			`iab.publisherCountryCode must be a two-letter country code such as ` +
				`"DE". Got ${JSON.stringify(iab.publisherCountryCode)}.`
		);
	}
	if (
		iab.consentScreen !== undefined &&
		!isWholeNumberIn(iab.consentScreen, 0, 63)
	) {
		throw new InthPluginError(
			`iab.consentScreen must be a whole number from 0 to 63. Got ` +
				`${JSON.stringify(iab.consentScreen)}.`
		);
	}
	return {
		cmpId: iab.cmpId,
		cmpVersion: iab.cmpVersion,
		consentScreen: iab.consentScreen ?? null,
		publisherCountryCode: country,
	};
};

/**
 * Validate `gpp.optOutCategories`, keeping an empty list empty.
 *
 * Unlike `consentCategories`, an empty list is a real answer here: no
 * category drives the opt-outs. Collapsing it into "not set" would make
 * both cores report an opt-out whenever `marketing` is refused, a signal the
 * app did not configure. `necessary` is dropped, since it is always granted.
 */
const normalizeGppOptOutCategories = function normalizeGppOptOutCategories(
	categories: readonly string[]
): ConsentCategoryId[] {
	if (!Array.isArray(categories)) {
		throw new InthPluginError(
			'gpp.optOutCategories must be an array of category ids, such as ' +
				'["marketing"]. Use [] for no category-driven opt-out.'
		);
	}
	const trimmed = categories.map((category) => String(category).trim());
	const unknown = [
		...new Set(
			trimmed.filter(
				(category) =>
					!(CONSENT_CATEGORY_IDS as readonly string[]).includes(category)
			)
		),
	];
	if (unknown.length > 0) {
		throw new InthPluginError(
			`gpp.optOutCategories accepts only ${CONSENT_CATEGORY_IDS.join(', ')}; ` +
				`unknown: ${unknown.map((name) => JSON.stringify(name)).join(', ')}.`
		);
	}
	return [...new Set(trimmed)].filter(
		(category) => category !== 'necessary'
	) as ConsentCategoryId[];
};

const GPP_MSPA_MODES: readonly InthGppMspaMode[] = [
	'opt-out-option',
	'service-provider',
];

/**
 * Validate the GPP options.
 *
 * An unknown MSPA mode is refused rather than dropped: a covered-transaction
 * claim is the publisher's to make, and a typo would ship a binary that
 * reports a transaction as not covered while `app.json` says otherwise.
 */
const normalizeGpp = function normalizeGpp(
	gpp: boolean | InthGppPluginProps | undefined
): ResolvedInthGppParams | null {
	if (gpp === undefined || gpp === false) {
		return null;
	}
	if (gpp === true) {
		return { mspaMode: null, optOutCategories: null, tcf: true };
	}
	if (gpp === null || typeof gpp !== 'object') {
		throw new InthPluginError(
			'gpp must be true or an object such as { "mspaMode": "opt-out-option" }. ' +
				'Omit it to leave GPP off.'
		);
	}
	if (gpp.mspaMode !== undefined && !GPP_MSPA_MODES.includes(gpp.mspaMode)) {
		throw new InthPluginError(
			`gpp.mspaMode must be ${GPP_MSPA_MODES.map((mode) => JSON.stringify(mode)).join(' or ')}. ` +
				`Got ${JSON.stringify(gpp.mspaMode)}. Omit it unless you signed the MSPA.`
		);
	}
	if (gpp.tcf !== undefined && typeof gpp.tcf !== 'boolean') {
		throw new InthPluginError(
			`gpp.tcf must be true or false. Got ${JSON.stringify(gpp.tcf)}.`
		);
	}
	return {
		mspaMode: gpp.mspaMode ?? null,
		optOutCategories:
			gpp.optOutCategories === undefined
				? null
				: normalizeGppOptOutCategories(gpp.optOutCategories),
		tcf: gpp.tcf ?? true,
	};
};

/**
 * Trim a Markdown prompt value, refusing one that carries no copy.
 *
 * Blank is not a default here. Apple answers an empty
 * `NSUserTrackingMarkdownUsageDescription` with the plain description, so a value
 * that trims to nothing builds a binary whose author meant to change the expanded
 * prompt and changed nothing.
 */
const normalizeMarkdownUsageDescription =
	function normalizeMarkdownUsageDescription(
		value: string | undefined,
		label: string
	): string {
		const trimmed = typeof value === 'string' ? value.trim() : '';
		if (trimmed === '') {
			throw new InthPluginError(
				`${label} is blank. Apple shows ` +
					`NSUserTrackingUsageDescription whenever the Markdown key carries ` +
					`no copy, so an empty one ships a binary that looks like it has an ` +
					`expanded prompt and does not. Write the Markdown prompt, or omit ` +
					`${label} to ship the plain one alone.`
			);
		}
		return trimmed;
	};

/**
 * Validate the per-locale Markdown prompt map.
 *
 * A locale tag is not only a label: it names the `<locale>.lproj` bundle the
 * string is written into, so a tag with a path separator in it would put a file
 * somewhere no build ever reads. That check is here for the same reason the
 * SKAdNetwork shape check is, to catch a paste error at prebuild rather than ship
 * a localization that silently does nothing.
 *
 * An empty value is refused for the reason the base string is, and de-duplication
 * runs on the trimmed tag so two spellings of one locale cannot both reach a
 * bundle.
 */
const normalizeMarkdownLocalizations = function normalizeMarkdownLocalizations(
	localizations: Readonly<Record<string, string>> | undefined
): InthTrackingMarkdownLocalization[] {
	if (localizations === undefined) {
		return [];
	}

	const entries = Object.entries(localizations);
	if (entries.length === 0) {
		throw new InthPluginError(
			'trackingMarkdownUsageDescriptionLocalizations is empty. Omit it ' +
				'entirely to ship the base prompt in the app default language.'
		);
	}

	const invalidLocales = [
		...new Set(
			entries
				.map(([locale]) => locale.trim())
				.filter((locale) => !LOCALE_TAG_PATTERN.test(locale))
		),
	];
	if (invalidLocales.length > 0) {
		throw new InthPluginError(
			`trackingMarkdownUsageDescriptionLocalizations keys must be locale ` +
				`tags Xcode writes a bundle for, such as "de", "fr-CA", or ` +
				`"zh-Hans", because each one names the .lproj folder the string is ` +
				`written into; invalid: ` +
				`${invalidLocales.map((locale) => JSON.stringify(locale)).join(', ')}.`
		);
	}

	const blankLocales = [
		...new Set(
			entries
				.filter(([, value]) => typeof value !== 'string' || value.trim() === '')
				.map(([locale]) => locale.trim())
		),
	];
	if (blankLocales.length > 0) {
		throw new InthPluginError(
			`trackingMarkdownUsageDescriptionLocalizations has no copy for ` +
				`${blankLocales.join(', ')}. An empty value is not a localization, ` +
				`and Apple answers one with the plain description, which is the ` +
				`copy these locales were meant to replace. Fill them in, or drop ` +
				`those keys.`
		);
	}

	const byLocale = new Map<string, string>();
	for (const [locale, value] of entries) {
		const trimmed = typeof value === 'string' ? value.trim() : '';
		if (trimmed !== '') {
			byLocale.set(locale.trim(), trimmed);
		}
	}

	return [...byLocale].map(([locale, value]) => ({ locale, value }));
};

const resolveAppTrackingTransparency = function resolveAppTrackingTransparency(
	props: InthPluginProps
): ResolvedInthParams['appTrackingTransparency'] {
	const enabled = props.enableAppTrackingTransparency ?? false;

	// Asked before anything is validated, because "opt-in off, but here is
	// Markdown copy" has no good write to fall back to: the string would be
	// compiled into the binary and no sheet would ever draw it.
	const markdownProps = [
		props.trackingMarkdownUsageDescription === undefined
			? null
			: 'trackingMarkdownUsageDescription',
		props.trackingMarkdownUsageDescriptionLocalizations === undefined
			? null
			: 'trackingMarkdownUsageDescriptionLocalizations',
	].filter((name): name is string => name !== null);

	if (!enabled && markdownProps.length > 0) {
		throw new InthPluginError(
			`enableAppTrackingTransparency is off, which leaves ` +
				`${markdownProps.join(' and ')} describing a prompt that cannot ` +
				`appear: only the expanded European Union ATT prompt reads ` +
				`NSUserTrackingMarkdownUsageDescription. Turn on App Tracking ` +
				`Transparency, or remove the Markdown description.`
		);
	}

	const markdownUsageDescription =
		props.trackingMarkdownUsageDescription === undefined
			? null
			: normalizeMarkdownUsageDescription(
					props.trackingMarkdownUsageDescription,
					'trackingMarkdownUsageDescription'
				);
	const markdownUsageDescriptionLocalizations = normalizeMarkdownLocalizations(
		props.trackingMarkdownUsageDescriptionLocalizations
	);

	if (!enabled) {
		return {
			enabled: false,
			markdownUsageDescription: null,
			markdownUsageDescriptionLocalizations: [],
			skAdNetworkIdentifiers: [],
			usageDescription: null,
		};
	}

	const usageDescription = props.trackingUsageDescription?.trim();
	if (!usageDescription) {
		throw new InthPluginError(
			'enableAppTrackingTransparency needs trackingUsageDescription: the ' +
				'string the permission prompt shows. App Review rejects a generic ' +
				'one, so this plugin will not write a placeholder.'
		);
	}

	const identifiers = props.skAdNetworkIdentifiers ?? [];
	const invalid = identifiers.filter(
		(identifier) => !SK_AD_NETWORK_IDENTIFIER_PATTERN.test(identifier.trim())
	);
	if (invalid.length > 0) {
		throw new InthPluginError(
			`skAdNetworkIdentifiers must look like "cstr6suwn9.skadnetwork"; ` +
				`invalid: ${invalid.map((value) => JSON.stringify(value)).join(', ')}.`
		);
	}

	return {
		enabled: true,
		markdownUsageDescription,
		markdownUsageDescriptionLocalizations,
		skAdNetworkIdentifiers: [
			...new Set(identifiers.map((identifier) => identifier.trim())),
		],
		usageDescription,
	};
};

/** Validate `bundleManifest`, which replaces `policyResource`. */
const normalizeBundleManifest = function normalizeBundleManifest(
	props: InthPluginProps
): ResolvedBundleManifest | null {
	const setting = props.bundleManifest;
	if (setting === undefined) {
		return null;
	}
	if (props.policyResource !== undefined) {
		throw new InthPluginError(
			'bundleManifest fetches and bundles the manifest itself; remove policyResource.'
		);
	}
	const options = setting === true ? {} : setting;
	if (options === null || typeof options !== 'object') {
		throw new InthPluginError(
			'bundleManifest must be true or an object such as { "allowStaleManifest": true }.'
		);
	}
	const days = options.expiresInDays;
	if (days !== undefined && !(typeof days === 'number' && days > 0)) {
		throw new InthPluginError(
			`bundleManifest.expiresInDays must be a number of days greater than zero. Got ${JSON.stringify(days)}.`
		);
	}
	return {
		allowStaleManifest: options.allowStaleManifest === true,
		dryRun: props.dryRun === true,
		expiresInDays: days ?? null,
		languages: (options.languages ?? []).map((language) => language.trim()),
		out:
			normalizeOptionalText(options.out, 'bundleManifest.out') ??
			'inth-policy.json',
		vendors: normalizeVendors(props.vendors),
	};
};

const POLICY_RULE_KEYS = new Set([
	'actions',
	'categories',
	'copyRevision',
	'id',
	'match',
	'model',
	'preselectedCategories',
	'privacySignals',
	'prompt',
	'review',
	'scopeMode',
	'validity',
]);
const POLICY_MATCH_KEYS = new Set([
	'countries',
	'fallback',
	'isDefault',
	'regionFallbacks',
	'regions',
]);
const OPTIONAL_CATEGORIES = new Set([
	'experience',
	'functionality',
	'marketing',
	'measurement',
]);
const DAY_MS = 86_400_000;

/** Prompts each model allows, as `@inth/sdk/schema` defines them. */
const POLICY_MODEL_PROMPTS: Readonly<Record<string, readonly string[]>> = {
	none: ['none'],
	'opt-in': ['choice'],
	'opt-out': ['choice', 'notice', 'none'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');

/** A rule as read from `app.json`, before any of it is trusted. */
type UncheckedRule = Record<string, unknown>;

/**
 * Trimmed category names, or the problem with them. Only `categories` takes the
 * `'*'` wildcard, as on the backend.
 */
const categoryNames = function categoryNames(
	value: unknown,
	field: string,
	label: string,
	options: { wildcard: boolean } = { wildcard: false }
): string[] | string {
	if (!isStringList(value)) {
		return `${label} ${field} must be a list of category names.`;
	}
	const names = value.map((name) => name.trim());
	const unknownName = names.find(
		(name) =>
			!(options.wildcard && name === '*') &&
			name !== 'necessary' &&
			!OPTIONAL_CATEGORIES.has(name)
	);
	return unknownName === undefined
		? names
		: `${label} ${field} has unknown category ${JSON.stringify(unknownName)}.`;
};

const optionalNames = (names: readonly string[]): string[] => [
	...new Set(names.filter((name) => OPTIONAL_CATEGORIES.has(name))),
];

const modelProblem = function modelProblem(
	rule: UncheckedRule,
	label: string
): string | null {
	const unknown = Object.keys(rule).filter((key) => !POLICY_RULE_KEYS.has(key));
	if (unknown.length > 0) {
		return `${label} has unsupported fields: ${unknown.join(', ')}.`;
	}
	const prompts = POLICY_MODEL_PROMPTS[rule.model as string];
	if (prompts === undefined) {
		return (
			`${label} has model ${JSON.stringify(rule.model)}. Use 'opt-in', ` +
			"'opt-out' or 'none'; 'iab' needs the vendor list, which comes from /init."
		);
	}
	return prompts.includes(rule.prompt as string)
		? null
		: `${label}: the ${String(rule.model)} model cannot use a ` +
				`${JSON.stringify(rule.prompt)} prompt; use ${prompts.join(' or ')}.`;
};

const isRegionList = (value: unknown): boolean =>
	Array.isArray(value) &&
	value.every(
		(region) =>
			isRecord(region) &&
			Object.keys(region).every(
				(key) => key === 'country' || key === 'region'
			) &&
			typeof region.country === 'string' &&
			region.country.trim() !== '' &&
			typeof region.region === 'string' &&
			region.region.trim() !== ''
	);

const matchProblem = function matchProblem(
	match: unknown,
	label: string
): string | null {
	if (!isRecord(match)) {
		return `${label} needs a match object.`;
	}
	const unknown = Object.keys(match).filter(
		(key) => !POLICY_MATCH_KEYS.has(key)
	);
	if (unknown.length > 0) {
		return `${label} match has unsupported fields: ${unknown.join(', ')}.`;
	}
	const codes = [match.countries, match.regionFallbacks].filter(
		(list) => list !== undefined
	);
	if (
		codes.some(
			(list) => !isStringList(list) || list.some((code) => code.trim() === '')
		)
	) {
		return `${label} match countries must be lists of non-empty codes.`;
	}
	if (match.regions !== undefined && !isRegionList(match.regions)) {
		return `${label} match.regions must be a list of { country, region } codes.`;
	}
	if (
		[match.fallback, match.isDefault].some(
			(flag) => flag !== undefined && typeof flag !== 'boolean'
		)
	) {
		return `${label} match.fallback and match.isDefault must be true or false.`;
	}
	const hasMatcher =
		match.fallback === true ||
		match.isDefault === true ||
		[match.countries, match.regions, match.regionFallbacks].some(
			(list) => Array.isArray(list) && list.length > 0
		);
	return hasMatcher
		? null
		: `${label} has no matcher. Add countries or regions, or set fallback or isDefault.`;
};

/** The rule's category scope, or the problem with it. */
const scopeOf = function scopeOf(
	rule: UncheckedRule,
	label: string
): string[] | string {
	const { categories, scopeMode } = rule;
	if (
		scopeMode !== undefined &&
		scopeMode !== 'strict' &&
		scopeMode !== 'permissive'
	) {
		return `${label} scopeMode must be 'strict' or 'permissive'.`;
	}
	if (categories === undefined) {
		return [...OPTIONAL_CATEGORIES];
	}
	const names = categoryNames(categories, 'categories', label, {
		wildcard: true,
	});
	if (typeof names === 'string') {
		return names;
	}
	const declared = optionalNames(names);
	if (names.includes('*') || declared.length === 0) {
		return [...OPTIONAL_CATEGORIES];
	}
	if (declared.length < OPTIONAL_CATEGORIES.size && scopeMode === undefined) {
		return `${label} selects only some categories, so it needs scopeMode 'strict' or 'permissive'.`;
	}
	return declared;
};

const preselectedProblem = function preselectedProblem(
	rule: UncheckedRule,
	scope: readonly string[],
	label: string
): string | null {
	if (rule.preselectedCategories === undefined) {
		return null;
	}
	// The backend refuses the field itself, even empty, under a model that
	// preselects nothing.
	if (rule.model === 'none') {
		return `${label}: the none model takes no preselectedCategories.`;
	}
	const names = categoryNames(
		rule.preselectedCategories,
		'preselectedCategories',
		label
	);
	if (typeof names === 'string') {
		return names;
	}
	return optionalNames(names).every((name) => scope.includes(name))
		? null
		: `${label} preselectedCategories must be inside categories.`;
};

const actionsProblem = function actionsProblem(
	rule: UncheckedRule,
	label: string
): string | null {
	const { actions } = rule;
	if (actions === undefined) {
		return null;
	}
	if (rule.prompt !== 'choice') {
		return `${label}: actions belong to a choice prompt.`;
	}
	if (
		!isStringList(actions) ||
		actions.some(
			(action) => !['accept', 'customize', 'reject'].includes(action)
		)
	) {
		return `${label} actions must list 'accept', 'reject' and optionally 'customize'.`;
	}
	return actions.includes('accept') && actions.includes('reject')
		? null
		: `${label} actions must include 'accept' and 'reject'.`;
};

/** Days the backend accepts, which round to at least one millisecond on a device. */
const daysProblem = function daysProblem(
	key: string,
	days: unknown,
	label: string
): string | null {
	if (key !== 'choiceDays' && key !== 'noticeDays') {
		return `${label} validity has unsupported field ${JSON.stringify(key)}.`;
	}
	if (
		typeof days !== 'number' ||
		!Number.isFinite(days) ||
		days <= 0 ||
		days * DAY_MS > Number.MAX_SAFE_INTEGER
	) {
		return `${label} validity.${key} must be a finite number of days greater than zero.`;
	}
	return Math.round(days * DAY_MS) < 1
		? `${label} validity.${key} must be at least one millisecond.`
		: null;
};

const validityProblem = function validityProblem(
	validity: unknown,
	label: string
): string | null {
	if (validity === undefined) {
		return null;
	}
	if (!isRecord(validity)) {
		return `${label} validity must be an object.`;
	}
	for (const [key, days] of Object.entries(validity)) {
		const problem = daysProblem(key, days, label);
		if (problem !== null) {
			return problem;
		}
	}
	return null;
};

const signalsProblem = function signalsProblem(
	signals: unknown,
	scope: readonly string[],
	label: string
): string | null {
	if (signals === undefined) {
		return null;
	}
	if (!isRecord(signals) || Object.keys(signals).some((key) => key !== 'gpc')) {
		return `${label} privacySignals takes only gpc.`;
	}
	const { gpc } = signals;
	if (gpc === undefined) {
		return null;
	}
	if (
		!isRecord(gpc) ||
		Object.keys(gpc).some((key) => key !== 'denyCategories')
	) {
		return `${label} privacySignals.gpc takes only denyCategories.`;
	}
	// Exact names: the backend neither trims nor takes a wildcard here.
	const names = gpc.denyCategories;
	if (!isStringList(names)) {
		return `${label} privacySignals.gpc.denyCategories must be a list of category names.`;
	}
	if (names.includes('necessary')) {
		return `${label} privacySignals.gpc cannot deny necessary.`;
	}
	const unknownName = names.find((name) => !OPTIONAL_CATEGORIES.has(name));
	if (unknownName !== undefined) {
		return `${label} privacySignals.gpc.denyCategories has unknown category ${JSON.stringify(unknownName)}.`;
	}
	if (new Set(names).size !== names.length) {
		return `${label} privacySignals.gpc.denyCategories repeats a category.`;
	}
	return names.every((name) => scope.includes(name))
		? null
		: `${label} privacySignals.gpc.denyCategories must be inside categories.`;
};

const REVIEW_KEYS = new Set([
	'assumptions',
	'reviewBy',
	'reviewedOn',
	'sources',
	'status',
]);

/** `review` is documentation only, but the backend checks its shape, so this does too. */
const reviewProblem = function reviewProblem(
	review: unknown,
	label: string
): string | null {
	if (review === undefined) {
		return null;
	}
	if (
		!isRecord(review) ||
		Object.keys(review).some((key) => !REVIEW_KEYS.has(key))
	) {
		return `${label} review must be an object with status, reviewedOn, reviewBy, sources or assumptions.`;
	}
	if (review.status !== 'pending' && review.status !== 'reviewed') {
		return `${label} review.status must be 'pending' or 'reviewed'.`;
	}
	const { assumptions, reviewBy, reviewedOn, sources } = review;
	if (
		[reviewedOn, reviewBy].some(
			(field) => field !== undefined && typeof field !== 'string'
		)
	) {
		return `${label} review dates must be strings.`;
	}
	return [sources, assumptions].every(
		(list) => list === undefined || isStringList(list)
	)
		? null
		: `${label} review.sources and review.assumptions must be lists of strings.`;
};

/**
 * Check one rule with the rules both native cores apply at launch: the backend's
 * authoring rules (`inspectPolicyRules` in `@inth/sdk/schema`) plus the in-code
 * limits. `packages/native-protocol/local-policy/parity.json` lists the cases all three
 * refuse, and the tests of each read it.
 *
 * @returns The first problem, or `null` for a usable rule.
 */
const policyRuleProblem = function policyRuleProblem(
	rule: unknown,
	index: number
): string | null {
	if (!isRecord(rule)) {
		return `policy rule ${index} must be an object.`;
	}
	if (typeof rule.id !== 'string' || rule.id.trim() === '') {
		return `policy rule ${index} needs a non-empty string id.`;
	}
	const label = `policy rule ${JSON.stringify(rule.id)}`;
	const scope = scopeOf(rule, label);
	if (typeof scope === 'string') {
		return scope;
	}
	const checks = [
		() => modelProblem(rule, label),
		() => matchProblem(rule.match, label),
		() => preselectedProblem(rule, scope, label),
		() => actionsProblem(rule, label),
		() => validityProblem(rule.validity, label),
		() => signalsProblem(rule.privacySignals, scope, label),
		() => reviewProblem(rule.review, label),
		() =>
			rule.copyRevision === undefined || typeof rule.copyRevision === 'string'
				? null
				: `${label} copyRevision must be a string.`,
	];
	for (const check of checks) {
		const problem = check();
		if (problem !== null) {
			return problem;
		}
	}
	return null;
};

/**
 * Check the in-code policy at prebuild with every rule the native cores check at
 * launch, so a policy the device would refuse never reaches a build.
 */
const normalizePolicy = function normalizePolicy(
	policy: InCodePolicy | undefined
): readonly InCodePolicyRule[] | null {
	if (policy === undefined) {
		return null;
	}
	const rules = (policy as { rules?: unknown } | null)?.rules;
	if (!Array.isArray(rules) || rules.length === 0) {
		throw new InthPluginError(
			'policy needs a non-empty rules array, such as { "rules": [{ "id": ' +
				'"default", "match": { "fallback": true, "isDefault": true }, ' +
				'"model": "opt-in", "prompt": "choice" }] }.'
		);
	}
	const problem = rules
		.map((rule: unknown, index) => policyRuleProblem(rule, index))
		.find((found) => found !== null);
	if (problem !== undefined && problem !== null) {
		throw new InthPluginError(problem);
	}
	const valid = rules as InCodePolicyRule[];
	const ids = valid.map((rule) => rule.id.trim());
	const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
	if (repeated !== undefined) {
		throw new InthPluginError(
			`policy rule ids must be unique; ${JSON.stringify(repeated)} repeats.`
		);
	}
	for (const flag of ['isDefault', 'fallback'] as const) {
		if (valid.filter((rule) => rule.match[flag] === true).length > 1) {
			throw new InthPluginError(`policy allows only one ${flag} rule.`);
		}
	}
	if (
		!valid.some(
			(rule) => rule.match.fallback === true || rule.match.isDefault === true
		)
	) {
		throw new InthPluginError(
			'policy needs a rule with match.fallback or match.isDefault, because ' +
				'the device has no location without /init.'
		);
	}
	return valid;
};

/**
 * Keep the in-code policy apart from the other policy sources.
 *
 * A bundled manifest is a second policy source, and IAB TCF needs the vendor
 * list, which comes from `/init`. An in-code policy never calls `/init`.
 */
const assertPolicySourcesDoNotMix = function assertPolicySourcesDoNotMix(
	props: InthPluginProps
): void {
	if (props.policy === undefined) {
		return;
	}
	const mixed = (['policyResource', 'bundleManifest', 'iab'] as const).filter(
		(key) => props[key] !== undefined
	);
	if (mixed.length > 0) {
		throw new InthPluginError(
			`policy cannot be combined with ${mixed.join(', ')}. The device ` +
				'resolves an in-code policy itself and never calls /init, which ' +
				'is where a bundled manifest and the IAB vendor list come from. ' +
				'Remove policy, or remove the others.'
		);
	}
};

/**
 * Resolve, validate, and default the plugin props.
 *
 * @param props - The value the host put in `app.json` for this plugin.
 * @returns Values ready to write into the native projects.
 * @throws {InthPluginError} When a value cannot be embedded safely.
 */
export const resolveParams = function resolveParams(
	props: InthPluginProps | undefined
): ResolvedInthParams {
	if (props === undefined || props === null) {
		throw new InthPluginError(`no parameters were passed; ${USAGE}`);
	}

	assertNoRetiredOptions(props);
	if (props.dryRun !== undefined && typeof props.dryRun !== 'boolean') {
		throw new InthPluginError(
			`dryRun must be true or false. Got ${JSON.stringify(props.dryRun)}.`
		);
	}
	const dryRun = props.dryRun === true;
	const projectUrl = resolveProjectUrl(props.projectUrl, dryRun);
	const backendHost = hostOf(projectUrl);
	assertPolicySourcesDoNotMix(props);

	const att = resolveAppTrackingTransparency(props);

	let privacyTrackingDomains: string[] = [];
	if (props.privacyTrackingDomains !== undefined) {
		if (!att.enabled) {
			throw new InthPluginError(
				'privacyTrackingDomains was set without ' +
					'enableAppTrackingTransparency. Declaring a tracking domain ' +
					'without a tracking prompt is a claim this plugin will not make ' +
					'for you: enable ATT here, or declare the domains yourself under ' +
					'ios.privacyManifests in app.json.'
			);
		}
		privacyTrackingDomains = [
			...new Set(props.privacyTrackingDomains.map(normalizeTrackingDomain)),
		];
	} else if (att.enabled) {
		privacyTrackingDomains = [backendHost];
	}

	if (att.enabled) {
		if (!privacyTrackingDomains.includes(backendHost)) {
			throw new InthPluginError(
				`privacyTrackingDomains must list ${backendHost}, the host of ` +
					`projectUrl. Consent records and the Inth subject id are sent ` +
					`there, so Apple expects it declared whenever the app tracks. ` +
					`Got ${privacyTrackingDomains.join(', ') || '(none)'}.`
			);
		}
	}

	return {
		androidMavenRepository: resolveAndroidMavenRepository(
			props.androidMavenRepository
		),
		appTrackingTransparency: att,
		autoBootstrap: props.autoBootstrap ?? true,
		backendHost,
		bundleManifest: normalizeBundleManifest(props),
		consentCategories: normalizeConsentCategories(props.consentCategories),
		dryRun,
		forceGPC: props.forceGPC ?? false,
		gpp: normalizeGpp(props.gpp),
		iab: normalizeIab(props.iab),
		policyResource: normalizeOptionalText(
			props.bundleManifest === undefined
				? props.policyResource
				: normalizeBundleManifest(props)?.out,
			'policyResource'
		),
		policyRules: normalizePolicy(props.policy),
		privacyTrackingDomains,
		projectUrl,
		property: normalizeOptionalText(props.property, 'property'),
		skipNativeBuildCheck: props.skipNativeBuildCheck ?? false,
		vendors: normalizeVendors(props.vendors),
	};
};
