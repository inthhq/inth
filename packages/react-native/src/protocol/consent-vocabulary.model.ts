/**
 * The consent vocabulary this package owns.
 *
 * Every name here crosses the bridge: it is a snapshot field, a save-body key,
 * or a category a subject decides on. `packages/native-protocol/CONTRACT.md` rule 1 gives the
 * native cores consent state and leaves the JavaScript layer to render it, but
 * rendering still means naming.
 *
 * Those names exist in `@inth/sdk/engine`. Importing them there would put the web
 * consent kernel into every mobile app's dependency graph for two small tables
 * and a dozen aliases: each host app would install and type-check a browser
 * consent engine that never runs, and each published declaration file would
 * name a package a phone build has no use for. So the vocabulary lives here and
 * this package owns it.
 *
 * Two gates keep the copy honest, and both read `@inth/sdk/engine` as the oracle,
 * which is why that package is a devDependency rather than a dependency:
 *
 * - `src/protocol/__tests__/consent-vocabulary.model.test.ts` compares the tables below with
 *   the kernel's, and with the spellings the Swift and Kotlin cores declare, so
 *   JavaScript, Swift, and Kotlin cannot quietly disagree.
 * - `src/protocol/__tests__/consent-vocabulary.model.type-test.ts` compares every type below
 *   with its kernel counterpart, and runs under `bun run check-types`.
 *
 * Where a comment calls an order load bearing, treat a reordering as a wire
 * change: the fixtures both native cores are graded against carry it.
 *
 * @packageDocumentation
 */

/**
 * Every category the runtime knows about, in stable display order.
 *
 * Mirrors `CONSENT_CATEGORIES` in `@inth/sdk/engine`. Order is load bearing: it is
 * the order a preference centre lists rows in, the order a fail-closed snapshot
 * fills, and the order the native cores enumerate when they build a save body.
 */
export const CONSENT_CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

/**
 * Every category, including `necessary`.
 *
 * The name is the one the rest of Inth uses for this union, on the snapshot, in
 * the hooks, and in the protocol fixtures. It is not a mobile spelling.
 */
export type AllConsentNames = (typeof CONSENT_CATEGORIES)[number];

/** Categories a subject can decide on. `necessary` is never a choice. */
export type OptionalConsentCategory = Exclude<AllConsentNames, 'necessary'>;

/**
 * Optional categories, in the order receipts are enumerated in.
 *
 * Mirrors `OPTIONAL_CONSENT_CATEGORIES` in `@inth/sdk/engine`. This order is load
 * bearing for hashing and for the order a save body lists categories in, so a
 * core's alphabetically sorted view of the same four names is not a substitute
 * for it.
 */
export const OPTIONAL_CONSENT_CATEGORIES = [
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const satisfies readonly OptionalConsentCategory[];

/**
 * Every consent model the wire can carry, in the order both native cores declare
 * them.
 *
 * This is the readable set: what `/init` may serve a device, and what both cores
 * are graded against. `@inth/sdk/schema` names the same four in `POLICY_RULE_MODELS`
 * (`packages/sdk/schema/src/shared/policy/policy-rule.model.ts`), and that package is not in this
 * one's graph, so `__tests__/consent-vocabulary.model.type-test.ts` is the gate that keeps this
 * a copy and not a second opinion -- it pins {@link KernelModel} below to the
 * kernel's `Model` union at compile time.
 *
 * Order is load bearing. Swift's `ConsentModel` and Kotlin's declare this
 * sequence, and `__tests__/consent-vocabulary.model.test.ts` compares all three as sequences,
 * which is what turns a model added on one platform and not another into a
 * failure here instead of a policy silently unread on a phone.
 */
export const POLICY_MODELS = ['opt-in', 'opt-out', 'iab', 'none'] as const;

/**
 * The consent models a native core may report.
 *
 * Configured native IAB authority can publish `iab`. The category evaluator
 * can report `opt-in` for an IAB policy without usable authority. Neither model
 * alone grants permission.
 */
export const NATIVE_MODELS = ['opt-in', 'opt-out', 'iab', 'none'] as const;

/**
 * Permission model the policy enforces, in the kernel's whole vocabulary.
 *
 * {@link POLICY_MODELS} verbatim, which is the kernel's `Model` union and is
 * pinned to it by `__tests__/consent-vocabulary.model.type-test.ts`. Native snapshots and save
 * payloads can carry all four values; see {@link NATIVE_MODELS}.
 */
export type KernelModel = (typeof POLICY_MODELS)[number];

/**
 * The surfaces a host may be asked to render, in prompt-severity order.
 *
 * Mirrors `ActiveUI` in `@inth/sdk/engine`. `none` is a decided answer; the undecided
 * case is `null`, which only the snapshot type carries.
 */
export const ACTIVE_SURFACES = ['none', 'banner', 'dialog'] as const;

/**
 * Which surface the host should render.
 *
 * `null` is the kernel's "not decided yet", which on device means no snapshot
 * has resolved: read `policyPending` rather than guessing from this field.
 */
export type KernelActiveUI = (typeof ACTIVE_SURFACES)[number] | null;

/** Why a prompt is still required, in the order the evaluator reports them. */
export const PROMPT_REASONS = ['missing', 'expired', 'policy-changed'] as const;

/** One of {@link PROMPT_REASONS}. */
export type PromptReason = (typeof PROMPT_REASONS)[number];

/**
 * Remaining required interaction after stored records were checked.
 *
 * Describes what is still owed, not whether a dialog is open. `kind` is the
 * interaction and `reason` says why it was not already satisfied; `none`
 * carries neither, which is what lets a host read the discriminant alone.
 */
export type PromptRequirement =
	| { kind: 'choice'; reason: PromptReason }
	| { kind: 'notice'; reason: PromptReason }
	| { kind: 'none' };

/** Why a category is restricted regardless of grants or defaults. */
export const RESTRICTION_REASONS = [
	'explicit-denial',
	'strict-scope',
	'gpc',
	'opt-out',
] as const;

/** One of {@link RESTRICTION_REASONS}. */
export type RestrictionReason = (typeof RESTRICTION_REASONS)[number];

/** Opt-out rights in canonical order. */
export const OPT_OUT_RIGHTS = ['sale', 'share', 'targeted_ads'] as const;

/** One of {@link OPT_OUT_RIGHTS}. */
export type OptOutRight = (typeof OPT_OUT_RIGHTS)[number];

/** How a durable opt-out record was created. */
export const OPT_OUT_METHODS = ['button', 'gpc', 'api', 'propagated'] as const;

/** One of {@link OPT_OUT_METHODS}. */
export type OptOutMethod = (typeof OPT_OUT_METHODS)[number];

/** Who holds a durable opt-out record. */
export const OPT_OUT_HOLDERS = ['device', 'person', 'both'] as const;

/** One of {@link OPT_OUT_HOLDERS}. */
export type OptOutHolder = (typeof OPT_OUT_HOLDERS)[number];

/**
 * Durable opt-out record, separate from per-category consent choices.
 *
 * Mirrors `OptOutRecord` in `@inth/sdk/engine`.
 */
export interface OptOutRecord {
	/** At least one right, no duplicates, in canonical order. */
	rights: OptOutRight[];
	/** How the opt-out was recorded. */
	method: OptOutMethod;
	/** Epoch milliseconds when the opt-out was recorded. */
	recordedAt: number;
	/** Whether the device, the person's account, or both hold this opt-out. */
	heldBy: OptOutHolder;
}

/**
 * Which policy contract a decision was confirmed against.
 *
 * - `choice-v1` binds to the versioned choice prompt fingerprint.
 * - `legacy-v2` comes from a v2 record, and its material fingerprint lives in
 *   the legacy hash domain, where it is only ever compared to another legacy
 *   fingerprint.
 */
export type ChoiceBasis =
	| { kind: 'choice-v1'; fingerprint: string }
	| { kind: 'legacy-v2'; materialFingerprint?: string };

/** Latest decision for one optional category. */
export interface CategoryDecision {
	/** Raw explicit value. `false` is a denial and never ages. */
	value: boolean;
	/** Epoch milliseconds when this category was confirmed. */
	confirmedAt: number;
	/** Policy contract the confirmation was made under. */
	basis: ChoiceBasis;
}

/**
 * Explicit category choices: the subject's own receipts.
 *
 * Absent keys are undecided, and the evaluator fills those from the policy
 * default without writing them back. `version` is a wire field, not a
 * convenience: a stored envelope carries it and a core reads it to decide
 * whether it can represent what it found.
 */
export interface ExplicitChoice {
	version: 3;
	categories: Partial<Record<OptionalConsentCategory, CategoryDecision>>;
}

/** Subject identifiers carried at the record's enclosing boundary. */
export interface ConsentSubject {
	subjectId?: string;
	externalId?: string;
	identityProvider?: string;
}

/**
 * Boolean map over every category.
 *
 * On the snapshot this is `effectivePermissions`, the map every gate reads.
 * `necessary` is a legal basis rather than a choice, so no evaluator path in
 * either native core switches it off.
 */
export type ConsentState = Record<AllConsentNames, boolean>;

/** Geographic context the backend reported for this request. */
export interface LocationResponse {
	countryCode: string | null;
	regionCode: string | null;
}

/**
 * Outcome of the producer's policy resolution.
 *
 * The four outcomes never collapse into one `null`: a device has to tell "no
 * policy system configured", "nothing matched", and "the wire could not be
 * read" apart, because only the last one is worth retrying.
 */
export type PolicyResolutionStatus =
	| 'unconfigured'
	| 'matched'
	| 'no-match'
	| 'failed';

/**
 * A `{ title, description }` pair. Either may be absent; the built-in
 * surfaces fall back to English string by string.
 */
export interface KernelTranslationPair {
	description?: string;
	title?: string;
}

/**
 * Copy for the vendor rows nested under a category in the preference centre.
 * The surfaces fill gaps from bundled defaults.
 */
export interface KernelVendorListCopy {
	/** Hint shown while the parent category is off, so vendor switches are disabled. */
	disabledByCategory?: string;
	/** Link text to a vendor's privacy policy. */
	privacyPolicy?: string;
	/** Accessible label for a vendor switch, with a `{vendor}` placeholder. */
	switchLabel?: string;
	/** Accessible name of the vendor list inside one category, with a `{count}` placeholder. */
	title?: string;
}

/** Preference centre copy, with the vendor rows' copy alongside. */
export interface KernelDialogCopy extends KernelTranslationPair {
	vendors?: KernelVendorListCopy;
}

/**
 * Cookie banner copy.
 *
 * The notice pair is used when the resolved policy requires a `notice` prompt.
 */
export interface KernelCookieBannerCopy extends KernelTranslationPair {
	noticeDescription?: string;
	noticeTitle?: string;
}

/** Copy for the labels a consent surface renders as actions. */
export interface KernelCommonCopy {
	acceptAll?: string;
	acknowledge?: string;
	customize?: string;
	dismiss?: string;
	rejectAll?: string;
	save?: string;
	/** Retry message shown and announced when a native consent commit fails. */
	saveError?: string;
}

/**
 * Translation groups as `/init` serves them.
 *
 * The backend sends a complete bundle; a custom transport may send only what
 * it overrides, so every string is optional. The native cores carry this
 * bundle through untouched, so a host that renders copy the built-in surfaces
 * do not name still finds the whole payload.
 */
export interface KernelTranslationGroups {
	common: KernelCommonCopy;
	/** Copy for the placeholder a gated embed shows while denied. */
	consentGate?: {
		actionButton?: string;
		title?: string;
	};
	consentManagerDialog: KernelDialogCopy;
	consentTypes: Partial<Record<AllConsentNames, KernelTranslationPair>>;
	cookieBanner: KernelCookieBannerCopy;
	legalLinks?: {
		cookiePolicy?: string;
		privacyPolicy?: string;
		termsOfService?: string;
	};
	rights?: {
		optOut?: string;
		preferences?: string;
	};
}

/** The `translations` field of an `/init` response. */
export type KernelTranslationBundle = KernelTranslationGroups;

/**
 * The translation bundle carried on the snapshot.
 *
 * Matches the `translations` field of the `/init` response: one resolved
 * language plus its payload. The native cores store it as JSON and hand it back
 * unchanged, so what the backend served is what a host reads.
 */
export interface KernelTranslations {
	language: string;
	translations: KernelTranslationBundle;
}
