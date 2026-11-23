import { compareCanonical } from './canonical-order';
import type { LegacyMaterialCompatibility } from './legacy-material-policy';
/**
 * Versioned fingerprint domains for v3 policy rules.
 *
 * Each domain has one job:
 *
 * - `policy` hashes the exact resolved behavior of a rule.
 * - `choice` decides whether an explicit category choice is still current.
 * - `notice` decides whether a notice dismissal is still current.
 * - `presentation` hashes intended layout and UI: a rule's `surface`, or a
 *   host's presentation. It never decides whether a prompt is owed.
 *
 * The domain name and its version are part of the hashed bytes, so a choice
 * hash can never equal a notice hash for the same rule, and neither can
 * collide with the legacy material fingerprint kept in `policy-fingerprint.ts`.
 *
 * Everything here is synchronous and runs once per resolution on the
 * producer side (backend, manifest builder, offline transport). Nothing in a
 * render or hydration path should call it.
 */
import {
	createMaterialPolicyFingerprintSync,
	createDeterministicFingerprintSync,
} from './policy-fingerprint';
import { canonicalizePolicySet as sorted } from './policy-rule';
import type {
	PolicyOptionalCategory,
	PolicyPromptAction,
	PolicyRight,
	PolicyRuleModel,
	ResolvedPolicyRule,
} from './policy-rule';
import type { PolicyScopeMode } from './policy-runtime';
import { canonicalizePolicySurface } from './policy-surface';
import type { ResolvedPolicySurface } from './policy-surface';

export const POLICY_FINGERPRINT_VERSION = 1;
export const CHOICE_PROMPT_FINGERPRINT_VERSION = 1;
export const NOTICE_PROMPT_FINGERPRINT_VERSION = 1;
export const PRESENTATION_FINGERPRINT_VERSION = 1;

/** JSON-compatible value. `undefined` members are dropped before hashing. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue | undefined };

/** Fingerprints a producer precomputes for one resolved rule. */
export interface PolicyFingerprints {
	/** Exact resolved behavior. Domain `policy`, version 1. */
	policy: string;
	/** Choice prompt currency. Domain `choice`, version 1. */
	choice: string;
	/** Notice prompt currency. Domain `notice`, version 1. */
	notice: string;
	/** Frozen v2 receipt comparator, retained for the lifetime of v3. */
	legacyMaterial?: string;
	/**
	 * The rule's `surface`, hashed in the presentation domain. Present only
	 * when the resolved rule has a `surface`. Caches keyed on what a visitor
	 * sees include it, so two packs with the same behavior and different
	 * layouts never share a rendered banner. Never decides whether a prompt
	 * is owed.
	 */
	presentation?: string;
}

/** Hashed input for the exact-policy domain. */
export interface PolicyFingerprintInput {
	domain: 'policy';
	version: typeof POLICY_FINGERPRINT_VERSION;
	model: PolicyRuleModel;
	prompt: ResolvedPolicyRule['prompt'];
	scope: PolicyOptionalCategory[];
	scopeMode: PolicyScopeMode;
	preselectedCategories: PolicyOptionalCategory[];
	actions: {
		allowed: PolicyPromptAction[];
		required: PolicyPromptAction[];
		equivalent: PolicyPromptAction[][];
	};
	rights: PolicyRight[];
	validity: { choiceMs: number; noticeMs: number };
	privacySignals: { gpc: { denyCategories: PolicyOptionalCategory[] } };
	copyRevision: string | null;
	proof: { storeIp: boolean; storeUserAgent: boolean; storeLanguage: boolean };
}

/** Hashed input for the choice prompt domain. */
export interface ChoicePromptFingerprintInput {
	domain: 'choice';
	version: typeof CHOICE_PROMPT_FINGERPRINT_VERSION;
	model: PolicyRuleModel;
	/** The configured prompt, never the runtime prompt reason. */
	prompt: ResolvedPolicyRule['prompt'];
	scope: PolicyOptionalCategory[];
	scopeMode: PolicyScopeMode;
	requiredActions: PolicyPromptAction[];
	validityMs: number;
	rights: PolicyRight[];
	privacySignals: { gpc: { denyCategories: PolicyOptionalCategory[] } };
	copyRevision: string | null;
}

/** Hashed input for the notice prompt domain. */
export interface NoticePromptFingerprintInput {
	domain: 'notice';
	version: typeof NOTICE_PROMPT_FINGERPRINT_VERSION;
	model: PolicyRuleModel;
	/** The configured prompt, never the runtime prompt reason. */
	prompt: ResolvedPolicyRule['prompt'];
	scope: PolicyOptionalCategory[];
	scopeMode: PolicyScopeMode;
	requiredActions: PolicyPromptAction[];
	validityMs: number;
	rights: PolicyRight[];
	privacySignals: { gpc: { denyCategories: PolicyOptionalCategory[] } };
	copyRevision: string | null;
}

/** Hashed input for the presentation domain. */
export interface PresentationFingerprintInput {
	domain: 'presentation';
	version: typeof PRESENTATION_FINGERPRINT_VERSION;
	presentation: JsonValue;
}

const sortedGroups = function sortedGroups(
	groups: readonly (readonly PolicyPromptAction[])[]
): PolicyPromptAction[][] {
	return groups
		.map((group) => sorted(group))
		.sort((left, right) => compareCanonical(left.join(','), right.join(',')));
};

/**
 * Builds the canonical input for the exact-policy fingerprint.
 *
 * @remarks
 * Excludes `id`, `match`, `i18n`, `surface` and `review`: two rules with
 * different ids but identical behavior share a policy fingerprint, and a
 * layout change never re-prompts anyone. Every set is re-sorted
 * so the input does not depend on the caller having normalized it.
 */
export const policyFingerprintInput = function policyFingerprintInput(
	rule: ResolvedPolicyRule
): PolicyFingerprintInput {
	return {
		actions: {
			allowed: sorted(rule.actions.allowed),
			equivalent: sortedGroups(rule.actions.equivalent),
			required: sorted(rule.actions.required),
		},
		copyRevision: rule.copyRevision,
		domain: 'policy',
		model: rule.model,
		preselectedCategories: sorted(rule.preselectedCategories),
		privacySignals: {
			gpc: { denyCategories: sorted(rule.privacySignals.gpc.denyCategories) },
		},
		prompt: rule.prompt,
		proof: {
			storeIp: rule.proof.storeIp,
			storeLanguage: rule.proof.storeLanguage,
			storeUserAgent: rule.proof.storeUserAgent,
		},
		rights: sorted(rule.rights),
		scope: sorted(rule.scope),
		scopeMode: rule.scopeMode,
		validity: {
			choiceMs: rule.validity.choiceMs,
			noticeMs: rule.validity.noticeMs,
		},
		version: POLICY_FINGERPRINT_VERSION,
	};
};

/**
 * Builds the canonical input for the choice prompt fingerprint (version 1).
 *
 * @remarks
 * Hashes the configured prompt, never the runtime prompt reason. Includes the
 * model, the prompt, required actions, scope and scope mode, choice validity,
 * rights, the GPC mapping (declared material for this version) and the copy
 * revision. Excludes cosmetic presentation, `id`, `match`, `i18n`, proof,
 * preselected categories and the notice validity.
 */
export const choicePromptFingerprintInput =
	function choicePromptFingerprintInput(
		rule: ResolvedPolicyRule
	): ChoicePromptFingerprintInput {
		return {
			copyRevision: rule.copyRevision,
			domain: 'choice',
			model: rule.model,
			privacySignals: {
				gpc: {
					denyCategories: sorted(rule.privacySignals.gpc.denyCategories),
				},
			},
			prompt: rule.prompt,
			requiredActions: sorted(rule.actions.required),
			rights: sorted(rule.rights),
			scope: sorted(rule.scope),
			scopeMode: rule.scopeMode,
			validityMs: rule.validity.choiceMs,
			version: CHOICE_PROMPT_FINGERPRINT_VERSION,
		};
	};

/**
 * Builds the canonical input for the notice prompt fingerprint (version 1).
 *
 * @remarks
 * Independent from the choice domain: notice validity and the choice
 * validity never affect each other's hash. Scope mode is included because it
 * changes what the notice discloses about out-of-scope processing.
 */
export const noticePromptFingerprintInput =
	function noticePromptFingerprintInput(
		rule: ResolvedPolicyRule
	): NoticePromptFingerprintInput {
		return {
			copyRevision: rule.copyRevision,
			domain: 'notice',
			model: rule.model,
			privacySignals: {
				gpc: {
					denyCategories: sorted(rule.privacySignals.gpc.denyCategories),
				},
			},
			prompt: rule.prompt,
			requiredActions: sorted(rule.actions.required),
			rights: sorted(rule.rights),
			scope: sorted(rule.scope),
			scopeMode: rule.scopeMode,
			validityMs: rule.validity.noticeMs,
			version: NOTICE_PROMPT_FINGERPRINT_VERSION,
		};
	};

/**
 * Fingerprint of intended presentation (copy, layout, variants).
 *
 * @remarks
 * It never affects prompt requirements. A policy pack carries it as
 * `fingerprints.presentation` when its rule has a `surface`
 * ({@link createPolicyRuleFingerprints}); otherwise it is computed only
 * when a consumer asks for it. It does not prove what a headless
 * application rendered. Object keys are sorted and `undefined`
 * members are dropped; array order is preserved because presentation order
 * is meaningful.
 */
export const createPresentationFingerprint =
	function createPresentationFingerprint(presentation: JsonValue): string {
		const input: PresentationFingerprintInput = {
			domain: 'presentation',
			presentation,
			version: PRESENTATION_FINGERPRINT_VERSION,
		};
		return createDeterministicFingerprintSync(input);
	};

/**
 * The presentation-domain input for a rule's `surface`, under a `surface`
 * key so a host's own presentation hashed in the same domain cannot
 * collide with it.
 */
export const policySurfacePresentationInput =
	function policySurfacePresentationInput(
		surface: ResolvedPolicySurface
	): JsonValue {
		return {
			surface: {
				blocking: surface.blocking,
				container: surface.container && { ...surface.container },
				edgeStyle: surface.edgeStyle,
			},
		};
	};

/**
 * Computes the policy, choice and notice fingerprints for one resolved rule,
 * plus the presentation fingerprint when the rule's canonical `surface`
 * has anything in it.
 *
 * @remarks
 * Synchronous and pure. Call it once at resolution time on the producer
 * side; never from a render or hydration path.
 *
 * @param rule - A normalized rule from {@link normalizePolicyRule}.
 * @returns Hex SHA-256 digests, one per domain.
 * `surface` never changes `policy`, `choice` or `notice`.
 * @example
 * ```ts
 * const rule = normalizePolicyRule(policyRulePresets.europeOptIn());
 * const { choice, notice } = createPolicyRuleFingerprints(rule);
 * ```
 */
export const createPolicyRuleFingerprints =
	function createPolicyRuleFingerprints(
		rule: ResolvedPolicyRule,
		legacy?: LegacyMaterialCompatibility
	): PolicyFingerprints {
		const policy = createDeterministicFingerprintSync(
			policyFingerprintInput(rule)
		);
		// Hash the canonical form, so a rule read off the wire and the same
		// rule normalized by the producer hash alike, and `{}` hashes nothing.
		const surface = canonicalizePolicySurface(rule.surface, rule);
		return {
			choice: createDeterministicFingerprintSync(
				choicePromptFingerprintInput(rule)
			),
			notice: createDeterministicFingerprintSync(
				noticePromptFingerprintInput(rule)
			),
			policy,
			...(surface && {
				presentation: createPresentationFingerprint(
					policySurfacePresentationInput(surface)
				),
			}),
			...(legacy && {
				legacyMaterial:
					policy === legacy.policyFingerprint
						? createMaterialPolicyFingerprintSync(legacy.input)
						: `policy-changed:${policy}`,
			}),
		};
	};
