/**
 * Normalized consent-record contracts.
 *
 * The semantics follow the #1025 decision review: one latest decision per
 * optional category, each carrying its own confirmation time and
 * policy-compatibility basis, with no history. The kernel snapshot exposes
 * these shapes directly; `@inth/sdk/consent-record` re-exports them.
 *
 * An integration that wants only the category vocabulary, and no part of the
 * kernel behind it, imports `@inth/sdk/consent-categories`. This file has no
 * imports of its own, so that subpath is the whole cost.
 */

/** Every category the runtime knows about, in stable display order. */
export const CONSENT_CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

/** One of {@link CONSENT_CATEGORIES}. */
export type CONSENT_CATEGORY = (typeof CONSENT_CATEGORIES)[number];

/** Every category the runtime knows about, including `necessary`. */
export type ConsentCategory = CONSENT_CATEGORY;

/** Categories a subject can decide on. `necessary` is never a choice. */
export type OptionalConsentCategory = Exclude<ConsentCategory, 'necessary'>;

/** Ordered list of optional categories. Order is stable for hashing. */
export const OPTIONAL_CONSENT_CATEGORIES = [
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const satisfies readonly OptionalConsentCategory[];

/**
 * Permission model the policy enforces. Notice is a prompt, not a model.
 * `none` permits processing by default with no prompt and no rights.
 */
export type PolicyModel = 'opt-in' | 'opt-out' | 'iab' | 'none';

/** First-layer interaction the policy requires. */
export type PolicyPrompt = 'choice' | 'notice' | 'none';

/** Why a prompt is still required. */
export type PromptReason = 'missing' | 'expired' | 'policy-changed';

/**
 * Remaining required interaction after stored records were checked.
 * Describes what is still owed, not whether a dialog is open.
 */
export type PromptRequirement =
	| { kind: 'choice'; reason: PromptReason }
	| { kind: 'notice'; reason: PromptReason }
	| { kind: 'none' };

/**
 * Which policy contract a decision was confirmed against.
 *
 * - `choice-v1` binds to the versioned choice prompt fingerprint.
 * - `legacy-v2` comes from a v2 browser record. Its optional material
 *   fingerprint lives in the legacy hash domain and is only ever compared
 *   to a legacy material fingerprint, never to a choice prompt fingerprint.
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
	/**
	 * Explicit expiry deadline in epoch milliseconds for synced account grants,
	 * used instead of `confirmedAt + policy.choice.maxAgeMs`.
	 */
	expiresAt?: number;
}

/**
 * Explicit category choices. Absent keys are undecided; the evaluator
 * fills them from the policy default without writing them back.
 */
export interface ExplicitChoice {
	version: 3;
	categories: Partial<Record<OptionalConsentCategory, CategoryDecision>>;
}

/**
 * Local record that the current notice was explicitly dismissed. The same
 * record acknowledges a choice prompt that had no category to decide; it
 * then carries the choice fingerprint instead of the notice fingerprint.
 */
export interface NoticeDismissal {
	version: 1;
	/** Epoch milliseconds of the dismissal. */
	dismissedAt: number;
	/** Prompt fingerprint the dismissal was made against. */
	fingerprint: string;
}

/** Subject identifiers carried at the record's enclosing boundary. */
export interface ConsentSubject {
	subjectId?: string;
	externalId?: string;
	identityProvider?: string;
}

/**
 * Semantic validity of a record kind. `maxAgeMs: null` is an explicit
 * unbounded compatibility projection for policies that configure no
 * expiry today; it is not a default the evaluator invents.
 */
export interface RecordValidity {
	fingerprint: string;
	maxAgeMs: number | null;
}

/**
 * Validated policy projection the evaluator consumes. Wildcards are
 * already expanded and fingerprints are computed once at resolution.
 */
export interface EvaluationPolicy {
	model: PolicyModel;
	prompt: PolicyPrompt;
	/** Optional categories the policy governs, sorted and deduplicated. */
	scope: readonly OptionalConsentCategory[];
	/** How categories outside `scope` behave. */
	scopeMode: 'strict' | 'permissive';
	/**
	 * Displayed categories required for a choice, inside `scope`; the whole
	 * scope unless declared categories narrow it. Empty means a choice
	 * prompt only asks for an acknowledgement.
	 */
	choiceScope: readonly OptionalConsentCategory[];
	choice: RecordValidity;
	notice: RecordValidity;
	/**
	 * Legacy material fingerprint of the same policy, when resolution can
	 * supply one. Only used to judge `legacy-v2` decisions. `null` means
	 * no comparison is possible and legacy decisions are grandfathered.
	 */
	legacyMaterialFingerprint: string | null;
	/**
	 * Categories an active GPC signal denies, and the categories a new
	 * opt-out withholds (see `policyOptOutCategories`). Empty means GPC is
	 * ignored.
	 */
	gpcDenyCategories: readonly OptionalConsentCategory[];
}

/** Why a category is restricted regardless of grants or defaults. */
export type RestrictionReason =
	| 'explicit-denial'
	| 'strict-scope'
	| 'gpc'
	| 'opt-out';

/** Authority status of a stored positive or negative decision. */
export type DecisionAuthority =
	| 'absent'
	| 'valid'
	| 'expired'
	| 'policy-changed';

/** Where an effective permission came from. */
export type PermissionSource = 'grant' | 'default' | 'restricted';

/** Per-category diagnostics derived during evaluation. */
export interface CategoryEvaluation {
	permitted: boolean;
	source: PermissionSource;
	authority: DecisionAuthority;
	inScope: boolean;
	/** Epoch milliseconds when a valid bounded decision stops being fresh. */
	expiresAt: number | null;
	restrictions: readonly RestrictionReason[];
}

/** Result of one pure evaluation. */
export interface ConsentEvaluation {
	/** Effective permissions for gates. `necessary` is always `true`. */
	permissions: Readonly<Record<ConsentCategory, boolean>>;
	/**
	 * Categories restricted by an explicit denial, strict scope exclusion,
	 * or a privacy opt-out. Distinct from a merely absent opt-in grant so
	 * IAB targets can honor refusals without gaining category prerequisites.
	 */
	restrictions: Readonly<
		Partial<Record<OptionalConsentCategory, readonly RestrictionReason[]>>
	>;
	promptRequirement: PromptRequirement;
	/** Earliest future time that can change permissions or prompt state. */
	nextDeadline: number | null;
	categories: Readonly<Record<OptionalConsentCategory, CategoryEvaluation>>;
}

/**
 * What every opt-out withheld before the policy decided it. A record stored
 * without its own `categories` was made under this mapping and keeps it; a
 * rule that maps no GPC categories still uses it.
 */
export const LEGACY_OPT_OUT_CATEGORIES = [
	'marketing',
	'measurement',
] as const satisfies readonly OptionalConsentCategory[];

/**
 * Optional categories a new opt-out withholds under `policy`, filtered to
 * `policy.scope`: the rule's GPC mapping (GPC is a sale and sharing opt-out,
 * and so is the visitor's own), or {@link LEGACY_OPT_OUT_CATEGORIES} when
 * the rule maps none. A browser records this list on the opt-out it makes.
 *
 * Returned in decision order, the reverse of the category order: the first
 * one is the category whose grant lifts the opt-out (`marketing`, then
 * `measurement`, ...).
 *
 * It lives beside the category vocabulary because a framework root's first
 * load already holds this file: a module of its own would be one more file
 * to fetch. Keep it small for the same reason.
 */
export const policyOptOutCategories = function policyOptOutCategories(
	policy: Pick<EvaluationPolicy, 'gpcDenyCategories' | 'scope'>
): OptionalConsentCategory[] {
	const mapped: readonly OptionalConsentCategory[] =
		policy.gpcDenyCategories.length > 0
			? policy.gpcDenyCategories
			: LEGACY_OPT_OUT_CATEGORIES;
	return OPTIONAL_CONSENT_CATEGORIES.filter(
		(category) => mapped.includes(category) && policy.scope.includes(category)
	).reverse();
};

/**
 * The category that decides an opt-out under `policy`: the first of
 * {@link policyOptOutCategories} (`marketing` for every stock mapping), or
 * `null` when the policy withholds nothing in scope. Granting it lifts the
 * opt-out; denying it keeps the opt-out.
 */
export const optOutDecidingCategory = function optOutDecidingCategory(
	policy: Pick<EvaluationPolicy, 'gpcDenyCategories' | 'scope'>
): OptionalConsentCategory | null {
	return policyOptOutCategories(policy)[0] ?? null;
};
