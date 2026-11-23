/**
 * The mobile consent snapshot: the one immutable value the native cores own
 * and the JavaScript layer renders.
 *
 * This is the shape on the wire. It is the kernel snapshot from `@inth/sdk/engine`
 * restricted to the fields that matter on device, plus the lifecycle flags a
 * native gate needs (`ready`, `policyPending`) and the IAB slot, which carries
 * the vendor list a device was served. The native cores serialize exactly this
 * object from `getSnapshot()`; the JavaScript layer never derives it.
 */

import type { NativeIABChoices } from './commit-payload.model';
import type { GlobalVendorList } from './global-vendor-list.model';
import type { NativeOverrides } from './native-overrides.model';
import type {
	AllConsentNames,
	ConsentState,
	ConsentSubject,
	ExplicitChoice,
	KernelActiveUI,
	KernelModel,
	KernelTranslations,
	LocationResponse,
	OptOutRecord,
	OptionalConsentCategory,
	PolicyResolutionStatus,
	PromptRequirement,
	RestrictionReason,
} from './consent-vocabulary.model';

/**
 * Consent model enforced on device.
 *
 * Native IAB authority can report `iab`. An IAB policy without usable native
 * authority can still report `opt-in` for category evaluation. Read effective
 * permissions and native vendor gates rather than treating the model as a grant.
 */
export type NativeModel = KernelModel;

/**
 * Explainability half of the policy resolution, as carried on the snapshot.
 *
 * The matched rule itself stays on the native side. The JavaScript layer only
 * needs to know whether a rule matched and which one, so it can show
 * explainability and decide when a re-prompt is owed.
 */
export interface SnapshotResolution {
	/** Resolution outcome, shared with the kernel's vocabulary. */
	readonly status: PolicyResolutionStatus;
	/** Identifier of the matched policy, `null` when nothing matched. */
	readonly policyId: string | null;
	/** Fingerprint of the matched rule, `null` when nothing matched. */
	readonly fingerprint: string | null;
	/** Why the resolution failed. Present only when `status` is `failed`. */
	readonly reason?: PolicyResolutionFailure;
}

/** Why a policy resolution failed, as the kernel's `PolicyResolutionFailure` names it. */
export const POLICY_RESOLUTION_FAILURES = [
	'invalid-configuration',
	'insufficient-inputs',
	'transport',
	'unsupported-contract',
	'invalid-payload',
] as const;

/** One of {@link POLICY_RESOLUTION_FAILURES}. */
export type PolicyResolutionFailure =
	(typeof POLICY_RESOLUTION_FAILURES)[number];

/**
 * Privacy signals the native cores honor.
 *
 * Mirrors `KernelPrivacySignals` in `@inth/sdk/engine`. The three members are not
 * interchangeable and a gate must read `active`:
 *
 * - `detected` is what the device reported. On mobile there is no user-agent
 *   flag to read, so this is the host app's report, or what `/init` resolved.
 * - `override` is {@link NativeOverrides.gpc}, `null` when the app set none.
 * - `active` is the value the evaluator honors: the override when set, else
 *   the detection.
 */
export interface NativeGpcSignal {
	/** Signal the device or backend reported. */
	readonly detected: boolean;
	/** Explicit override from {@link NativeOverrides.gpc}, or `null`. */
	readonly override: boolean | null;
	/** Signal the evaluator honors: the override when set, else the detection. */
	readonly active: boolean;
}

/**
 * Privacy signals the native cores honor.
 */
export interface NativePrivacySignals {
	readonly gpc: NativeGpcSignal;
}

/**
 * Failure the native core is holding, if any.
 *
 * A failed init does not throw into the app. It sets `error`, keeps
 * `policyPending` true, and leaves every optional category denied.
 */
export interface NativeSnapshotError {
	readonly code: string;
	readonly message: string;
}

/**
 * The IAB half of a snapshot.
 *
 * This React Native snapshot projection carries the GVL disclosure only.
 * CMP configuration, committed TC Strings and purpose/vendor vectors remain in
 * native authority; their absence here does not mean the native core lacks them.
 * Use native IAB APIs and gates for consent decisions. Holding a GVL is not a grant.
 */
export interface NativeIABState {
	/** Global Vendor List (IAB-registered vendors + purposes), or `null`. */
	readonly gvl: GlobalVendorList | null;
	/**
	 * The current committed TCF decision, or `null` when none is current. The
	 * bridge adds it beside the core's `gvl`; a binary older than this field
	 * omits it, which the client reads as `null`.
	 */
	readonly committed: NativeIABCommittedConsent | null;
	/**
	 * Whether a headless draft can be edited and saved now: an IAB policy, CMP
	 * configuration, a vendor list that is still usable, a current Additional
	 * Consent list where one is required, a {@link NativeIABState.disclosure},
	 * and nothing in {@link NativeIABState.headlessUnsupported}. `false` while
	 * the list is stale or offline; refresh, then offer controls again. A binary
	 * older than this field cannot commit a headless draft and reads as `false`.
	 */
	readonly editable: boolean;
	/**
	 * What a custom screen built on this snapshot could not disclose, so
	 * `editable` stays `false` for as long as the list is not empty. This
	 * release's binaries always send `[]`: they carry publisher restrictions and
	 * Additional Consent providers in {@link NativeIABState.disclosure}. A
	 * binary from before `disclosure` lists `'publisher-restrictions'` or
	 * `'additional-consent-providers'` here; use the stock screens there. A
	 * binary older than this field reads as `[]`; it is not `editable` either.
	 */
	readonly headlessUnsupported: readonly NativeIABHeadlessGap[];
	/**
	 * What Accept all saves on the current list, as the native core builds it:
	 * every live partner's bases under the publisher's disclosure and
	 * restrictions. `null` exactly when {@link NativeIABState.editable} is false.
	 */
	readonly acceptAll: NativeIABChoices | null;
	/**
	 * The native core's own disclosure, the one the stock screens draw: each
	 * vendor's legal bases after publisher restrictions, the Additional Consent
	 * providers, partner counts per purpose and the first-layer summary. Show
	 * these rather than the raw `gvl` declarations. `null` while no IAB policy
	 * and configuration apply, and from a binary older than this field.
	 */
	readonly disclosure: NativeIABDisclosure | null;
	/**
	 * Partners the publisher declares outside the Global Vendor List, as `/init`
	 * served them. They get their own consent and legitimate-interest choices
	 * (`customVendorConsents`, `customVendorLegitimateInterests`), which native
	 * keeps beside the TC String, and their purposes count toward which purposes
	 * decide a category, as on the web. A binary older than this field reads as
	 * `[]`.
	 */
	readonly customVendors: readonly NativeIABCustomVendor[];
}

/**
 * A custom (non-IAB) vendor: `NonIABVendor` in `@inth/sdk/schema`, with `id` always
 * a string, as the web keys its consent maps (`String(vendor.id)`).
 */
export interface NativeIABCustomVendor {
	readonly id: string;
	readonly name: string;
	readonly privacyPolicyUrl: string;
	/** IAB purposes it asks consent for. */
	readonly purposes: readonly number[];
	/** IAB purposes it claims under legitimate interest. */
	readonly legIntPurposes: readonly number[];
	readonly specialFeatures: readonly number[];
	readonly features: readonly number[];
	readonly dataCategories: readonly number[];
	readonly description?: string;
	readonly cookieMaxAgeSeconds?: number;
	readonly dataRetentionDays?: number;
	readonly usesCookies: boolean;
	readonly usesNonCookieAccess: boolean;
}

/**
 * A configuration a binary from before {@link NativeIABState.disclosure}
 * could not give a headless IAB screen: publisher restrictions, or
 * Additional Consent providers on the served list.
 */
export type NativeIABHeadlessGap =
	| 'additional-consent-providers'
	| 'publisher-restrictions';

/**
 * One vendor's legal bases after publisher restrictions, as the native gates
 * evaluate them. Every list is ascending.
 */
export interface NativeIABVendorDisclosure {
	/** Purposes the vendor asks consent for. Offer a vendor consent switch only when not empty. */
	readonly consentPurposes: readonly number[];
	/**
	 * Purposes the vendor relies on legitimate interest for. Offer a vendor
	 * legitimate-interest (objection) switch only when not empty.
	 */
	readonly legitimateInterestPurposes: readonly number[];
	/** Purposes a publisher restriction does not allow this vendor at all. */
	readonly notAllowedPurposes: readonly number[];
	/**
	 * Purposes the vendor declares on legitimate interest that a restriction
	 * moved to consent. Each is also in `consentPurposes`.
	 */
	readonly consentRequiredPurposes: readonly number[];
	/**
	 * Purposes the vendor declares on consent that a restriction moved to
	 * legitimate interest. Each is also in `legitimateInterestPurposes`.
	 */
	readonly legitimateInterestRequiredPurposes: readonly number[];
}

/** Partners per purpose after publisher restrictions. */
export interface NativeIABPurposePartnerCounts {
	/** Vendors that ask for consent, plus Google ad tech providers for purposes 1, 3 and 4. */
	readonly consentPartnerCount: number;
	/** Vendors that rely on legitimate interest. */
	readonly legitimateInterestPartnerCount: number;
}

/** A Google Additional Consent provider, which is not on the IAB vendor list. */
export interface NativeAdTechProvider {
	/** Google's provider ID. */
	readonly id: number;
	readonly name: string;
	/** The provider's privacy policy. */
	readonly policyUrl: string;
}

/**
 * What the stock native screens show for an IAB policy, from the native
 * core's own projection. A headless screen reads it instead of deriving
 * legal bases from the raw vendor list.
 */
export interface NativeIABDisclosure {
	/** Active vendors in the served list, by vendor ID. */
	readonly vendors: Readonly<Record<string, NativeIABVendorDisclosure>>;
	/** Partner counts for each of {@link NativeIABDisclosure.declaredPurposeIds}, by purpose ID. */
	readonly purposes: Readonly<Record<string, NativeIABPurposePartnerCounts>>;
	/**
	 * Purposes some vendor declares, plus 1, 3 and 4 when Additional Consent
	 * providers are listed: the purposes the second layer lists. Ascending.
	 */
	readonly declaredPurposeIds: readonly number[];
	/** Special features some vendor declares. Ascending. */
	readonly declaredSpecialFeatureIds: readonly number[];
	/**
	 * Google Additional Consent providers to list apart from IAB vendors, with
	 * a switch and privacy-policy link each. `null` when none are configured.
	 */
	readonly adTechProviders: readonly NativeAdTechProvider[] | null;
	/**
	 * Purposes 1, 3 and 4: native records every provider as off unless all
	 * three have consent. Say so beside the provider list.
	 */
	readonly adTechProviderPurposeIds: readonly number[];
	/** The first layer's partner count and purpose, stack and feature names. */
	readonly bannerSummary: {
		/** IAB vendors and Additional Consent providers together. */
		readonly vendorCount: number;
		readonly displayItems: readonly string[];
		/** How many names the cap left out, for an "and N more" line. */
		readonly remainingCount: number;
	};
	/**
	 * The longest a saved decision and its TC String stay in use on this
	 * device, in whole days, from the policy's choice validity. `null` when no
	 * limit applies.
	 */
	readonly consentStorageMaxDays: number | null;
	/** The two-letter upper-case language of the list's names and descriptions. */
	readonly language: string;
}

/** The committed TCF decision a headless IAB screen shows and reopens with. */
export interface NativeIABCommittedConsent {
	/** The encoded TC String, the same one native writes to the storage bus. */
	readonly tcString: string;
	/** The Google Additional Consent string, or `null`. */
	readonly addtlConsent: string | null;
	/** The selection the TC String encodes. */
	readonly choices: NativeIABChoices;
}

/**
 * The subject as the native cores publish it.
 *
 * The kernel's `ConsentSubject` without `identityProvider`: neither native
 * subject model stores one, so no native snapshot can carry it, and declaring
 * it would promise a key the bridge never sends.
 */
export type NativeConsentSubject = Omit<ConsentSubject, 'identityProvider'>;

/**
 * The immutable snapshot `getSnapshot()` returns as a JSON string.
 *
 * `ready` and `policyPending` are the two flags a gate must consult: while
 * either is unset, every optional category reads `false`. `revision` is
 * monotonic and is the only value an event needs to carry, because
 * subscribers pull the snapshot instead of receiving a copy of it.
 */
export interface ConsentSnapshot {
	/** Monotonic revision, bumped on every native mutation. */
	readonly revision: number;
	/** `true` until the first init resolves a policy. */
	readonly policyPending: boolean;
	/**
	 * `false` until hydration found a stored envelope or the first init
	 * resolved. It latches: a later failed refresh does not clear it.
	 */
	readonly ready: boolean;
	/** Model the evaluator applies. */
	readonly model: NativeModel;
	/** Surface the UI should render, if any. */
	readonly activeUI: KernelActiveUI;
	/** Interaction the active policy still requires. */
	readonly promptRequirement: PromptRequirement;
	/** Effective permissions every gate reads. */
	readonly effectivePermissions: ConsentState;
	/** Latest per-category receipts. Only accept, reject and save write it. */
	readonly explicitChoice: ExplicitChoice | null;
	/**
	 * Categories the consent surfaces list: `necessary` first, then the categories
	 * of the resolved policy scope the app's declared scope survives. The native
	 * core decides this list the way the web dialog decides its own, so a name the
	 * policy does not govern is never rendered. `null` only while no configuration
	 * has been installed, where the UI lists every category it knows.
	 */
	readonly consentCategories: readonly AllConsentNames[] | null;
	/** Categories denied regardless of grants, with the reason. */
	readonly restrictions: Partial<
		Record<OptionalConsentCategory, readonly RestrictionReason[]>
	>;
	/** Explainability for how the policy was matched. */
	readonly resolution: SnapshotResolution;
	/** Signed token for write-time consistency, sent back on save. */
	readonly policySnapshotToken: string | null;
	/** Subject identifiers, carried once. */
	readonly subject: NativeConsentSubject | null;
	/** Geographic context reported by the backend. */
	readonly location: LocationResponse | null;
	/** Geographic, language, and GPC overrides in effect. */
	readonly overrides: NativeOverrides;
	/** Effective privacy signals. */
	readonly privacySignals: NativePrivacySignals;
	/** Resolved translation bundle. */
	readonly translations: KernelTranslations | null;
	/** Earliest future time (epoch ms) that can change permissions. */
	readonly nextDeadline: number | null;
	/**
	 * Durable opt-out record, or `null` when none is held. A binary built before
	 * this field existed omits it, and the client reads that as `null`.
	 */
	readonly optOut: OptOutRecord | null;
	/** Epoch milliseconds of the last evaluation. */
	readonly evaluatedAt: number;
	/** Failure the core is holding, or `null`. */
	readonly error: NativeSnapshotError | null;
	/**
	 * IAB TCF state: the vendor list this device was served, or `null`.
	 *
	 * `null` is a real answer, and there is one way to hold it: no `/init` has served a
	 * `gvl` this build could read. That is the ordinary answer for every policy whose
	 * model is not `iab`, because the backend embeds a list only while it is.
	 *
	 * Both cores fold a served list onto this key and keep it when a later `/init`
	 * serves none. The disclosure a subject was already shown is drawn out of that
	 * document, so dropping it would change a claim the subject was given without the
	 * subject doing anything, and only a reset takes it back. Kotlin keeps the bytes
	 * under the stored envelope's own `gvl` key and puts them back here on hydration,
	 * so the encrypted blob carries one copy of the largest thing in it and a device
	 * upgrading from a build that kept the list only there keeps its disclosure.
	 *
	 * A host app's own code reads the same document off the same state: Kotlin's
	 * `ConsentCore.vendorListBody()` and Swift's `globalVendorList()` are both the
	 * snapshot field, which is what keeps a disclosure drawn natively and one drawn
	 * through this bridge naming the same vendors.
	 *
	 * The key is never absent: a serialised `null` where there is no list is what lets
	 * a JavaScript layer that predates TCF avoid branching on an SDK version.
	 */
	readonly iab: NativeIABState | null;
	/**
	 * The IAB GPP string for this state, or `null`.
	 *
	 * `null` while GPP is off, which it is until the app turns it on with the Expo
	 * plugin's `gpp` option or the native `gpp` setting, and whenever no section
	 * applies. The native core derives it from the matched rule, the location and
	 * the committed TC String, and writes the same string to `IABGPP_HDR_GppString`.
	 * Read it with `useGPPString()`.
	 */
	readonly gppString: string | null;
	/**
	 * The `revision` at which the prompt owed now became owed, or `null` while nothing
	 * is owed.
	 *
	 * The native core sets it each time a prompt becomes owed again, including the same
	 * requirement owed again after an answer or a reset, so it tells a new owed prompt
	 * from one already presented even when the bridge delivered only the latest
	 * snapshot. It is native bookkeeping, not kernel state, and the bridge adds it. A
	 * binary built before it existed omits it, and the client reads that as `null`.
	 */
	readonly promptOwedSince: number | null;
	/**
	 * Under an IAB TCF policy, whether the committed TC String grants the
	 * `marketing` category: every TCF purpose it maps to that some vendor asks
	 * consent for, as `iabPurposesToInthConsents` in `@inth/sdk/iab` derives it.
	 * `null` outside IAB, before a TC String is saved, and on a binary that
	 * predates the field. The ATT sequence reads it; purpose vectors stay in
	 * native authority.
	 */
	readonly iabMarketingPurposes: boolean | null;
}
