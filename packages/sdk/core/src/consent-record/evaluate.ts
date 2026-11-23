/**
 * Pure consent evaluator.
 *
 * Takes validated records, a resolved policy projection, privacy inputs
 * and an explicit `now`, and derives effective permissions, a separate
 * restriction map, the remaining prompt requirement and the next deadline.
 * No storage, hashing, identity, network, `Date.now`, callbacks or IAB
 * imports. Every caller (construction, hydration, init, actions, privacy
 * changes, expiry timers) is expected to run this same function.
 *
 * @internal
 */

import type { OptOutRecord } from '@inth/sdk-schema/types';

import { decisionAuthority, isBasisCompatible } from './decision-authority';
import {
	OPT_OUT_REPROMPT_WAIT_MS,
	optInPromptAllowedAt,
	optOutDenyCategories,
} from './opt-out-rules';
import { OPTIONAL_CONSENT_CATEGORIES, optOutDecidingCategory } from './types';
import type {
	CategoryDecision,
	CategoryEvaluation,
	ConsentCategory,
	ConsentEvaluation,
	DecisionAuthority,
	EvaluationPolicy,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
	PromptReason,
	PromptRequirement,
	RestrictionReason,
} from './types';

export { OPT_OUT_REPROMPT_WAIT_MS, optInPromptAllowedAt };

export interface ConsentEvaluationInput {
	policy: EvaluationPolicy;
	/** Validated explicit choice, or `null` when none is usable. */
	choice: ExplicitChoice | null;
	noticeDismissal: NoticeDismissal | null;
	/** Validated durable opt-out record, or `null` when none is held. */
	optOut?: OptOutRecord | null;
	/** Detected GPC signal. Only a strict `true` counts. */
	gpc?: boolean;
	/** Current time in epoch milliseconds. */
	now: number;
}

const defaultPermission = function defaultPermission(
	policy: EvaluationPolicy,
	inScope: boolean
): boolean {
	if (!inScope) {
		return policy.scopeMode === 'permissive';
	}
	// Opt-out and none both permit processing until something restricts it.
	return policy.model === 'opt-out' || policy.model === 'none';
};

const collectRestrictions = function collectRestrictions(
	category: OptionalConsentCategory,
	decision: CategoryDecision | undefined,
	authority: DecisionAuthority,
	inScope: boolean,
	input: ConsentEvaluationInput
): RestrictionReason[] {
	const restrictions: RestrictionReason[] = [];
	if (decision?.value === false) {
		restrictions.push('explicit-denial');
	}
	if (!inScope && input.policy.scopeMode === 'strict') {
		restrictions.push('strict-scope');
	}
	if (input.gpc === true && input.policy.gpcDenyCategories.includes(category)) {
		restrictions.push('gpc');
	}
	if (
		input.optOut &&
		optOutDenyCategories(input.policy, input.optOut).includes(category)
	) {
		const deciding = optOutDecidingCategory(input.policy);
		const decidingValue =
			deciding === null ? undefined : input.choice?.categories[deciding]?.value;
		// A held opt-out already refuses the deciding category, so a grant of
		// another category stands once the visitor confirms it after opting
		// out, as Preferences does when it saves only the switched category.
		// One made before the opt-out stands only beside an explicit refusal
		// of the deciding category in the same choice. The deciding category
		// itself, or a choice that grants it, never stands: lifting the
		// opt-out takes `optIn()` or a confirmed save.
		const explicitGrantStands =
			deciding !== null &&
			category !== deciding &&
			decision?.value === true &&
			authority === 'valid' &&
			(decidingValue === false ||
				(decidingValue === undefined &&
					decision.confirmedAt > input.optOut.recordedAt));
		if (!explicitGrantStands) {
			restrictions.push('opt-out');
		}
	}
	return restrictions;
};

const evaluateCategory = function evaluateCategory(
	category: OptionalConsentCategory,
	input: ConsentEvaluationInput
): CategoryEvaluation {
	const { policy } = input;
	const decision = input.choice?.categories[category];
	const inScope = policy.scope.includes(category);
	const { authority, expiresAt } = decisionAuthority(
		decision,
		policy,
		input.now
	);
	const restrictions = collectRestrictions(
		category,
		decision,
		authority,
		inScope,
		input
	);

	let permitted = defaultPermission(policy, inScope);
	let source: CategoryEvaluation['source'] = 'default';
	if (inScope && decision?.value === true && authority === 'valid') {
		permitted = true;
		source = 'grant';
	}
	if (restrictions.length > 0) {
		permitted = false;
		source = 'restricted';
	}

	return { authority, expiresAt, inScope, permitted, restrictions, source };
};

const requirement = function requirement(
	kind: 'choice' | 'notice',
	reason: PromptReason
): PromptRequirement {
	return { kind, reason };
};

/** An automatic Accept All prompt must not solicit reversal of a refusal. */
const hasChoiceRefusal = function hasChoiceRefusal(
	policy: EvaluationPolicy,
	categories: Record<OptionalConsentCategory, CategoryEvaluation>
): boolean {
	return policy.choiceScope.some(
		(category) => categories[category].restrictions.length > 0
	);
};

const acknowledgementExpiry = function acknowledgementExpiry(
	acknowledgement: NoticeDismissal,
	policy: EvaluationPolicy
): number | null {
	return policy.choice.maxAgeMs === null
		? null
		: acknowledgement.dismissedAt + policy.choice.maxAgeMs;
};

/**
 * When a current acknowledgement of the choice prompt runs out: `null` for
 * never, `undefined` when there is none or it already ran out.
 */
const choiceAcknowledgedUntil = function choiceAcknowledgedUntil(
	input: ConsentEvaluationInput
): number | null | undefined {
	const { policy } = input;
	const dismissal = input.noticeDismissal;
	if (!dismissal || dismissal.fingerprint !== policy.choice.fingerprint) {
		return undefined;
	}
	const expiresAt = acknowledgementExpiry(dismissal, policy);
	return expiresAt === null || input.now < expiresAt ? expiresAt : undefined;
};

/**
 * When an acknowledgement that answers a choice prompt with categories to
 * decide runs out, or `undefined` when none does. Only one recorded in the
 * same action as a decision in the choice scope counts, as a rights control
 * records it. An acknowledgement of an empty scope never answers once a
 * category is displayed, though the choice fingerprint stays the same.
 */
const rightsAcknowledgedUntil = function rightsAcknowledgedUntil(
	input: ConsentEvaluationInput
): number | null | undefined {
	const until = choiceAcknowledgedUntil(input);
	const dismissal = input.noticeDismissal;
	if (until === undefined || !dismissal) {
		return undefined;
	}
	const { policy } = input;
	const decisions = input.choice?.categories;
	return policy.choiceScope.some((category) => {
		const decision = decisions?.[category];
		return (
			decision !== undefined &&
			decision.confirmedAt === dismissal.dismissedAt &&
			isBasisCompatible(decision, policy)
		);
	})
		? until
		: undefined;
};

/**
 * When the choice prompt with nothing to decide stops being answered, or
 * `undefined` when it is not answered now. A choice acknowledgement is a
 * dismissal record made against the choice fingerprint; any decision still
 * valid under the current choice contract answers it too. `null` means one
 * of them never expires.
 */
const acknowledgedUntil = function acknowledgedUntil(
	input: ConsentEvaluationInput,
	categories: Record<OptionalConsentCategory, CategoryEvaluation>
): number | null | undefined {
	const expiries: (number | null)[] = [];
	const acknowledged = choiceAcknowledgedUntil(input);
	if (acknowledged !== undefined) {
		expiries.push(acknowledged);
	}
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const evaluation = categories[category];
		if (evaluation.authority === 'valid') {
			expiries.push(evaluation.expiresAt);
		}
	}
	if (expiries.length === 0) {
		return undefined;
	}
	return expiries.includes(null) ? null : Math.max(...(expiries as number[]));
};

/**
 * A choice prompt with nothing to decide, because no displayed category is
 * in the policy scope, still asks once: the visitor acknowledges that only
 * strictly necessary processing runs. The acknowledgement lasts as long as
 * a choice would and binds to the choice fingerprint, so a policy edit asks
 * again. A stale acknowledgement or decision says why it is asked again.
 */
const deriveAcknowledgementRequirement =
	function deriveAcknowledgementRequirement(
		input: ConsentEvaluationInput,
		categories: Record<OptionalConsentCategory, CategoryEvaluation>
	): PromptRequirement {
		if (acknowledgedUntil(input, categories) !== undefined) {
			return { kind: 'none' };
		}
		const { policy } = input;
		const dismissal = input.noticeDismissal;
		const authorities = OPTIONAL_CONSENT_CATEGORIES.map(
			(category) => categories[category].authority
		);
		if (
			(dismissal && dismissal.fingerprint === policy.choice.fingerprint) ||
			authorities.includes('expired')
		) {
			return requirement('choice', 'expired');
		}
		if (dismissal || authorities.includes('policy-changed')) {
			return requirement('choice', 'policy-changed');
		}
		return requirement('choice', 'missing');
	};

/**
 * Refusals suppress automatic choice prompts, including when another category
 * is new or a grant expires. Permissions still expire and users can open
 * preferences themselves. A current acknowledgement made with a decision
 * answers the prompt too: a rights control records one when the visitor
 * decides a statutory right without deciding every category (BNR-05,
 * RIGHT-08). Otherwise aggregate:
 * no usable record, then a known material mismatch in the required scope,
 * then any required category without a decision, then any required
 * positive decision past its lifetime. Neither elapsed time nor a policy
 * edit cancels a refusal. An empty choice scope asks for an
 * acknowledgement instead.
 */
const deriveChoiceRequirement = function deriveChoiceRequirement(
	input: ConsentEvaluationInput,
	categories: Record<OptionalConsentCategory, CategoryEvaluation>
): PromptRequirement {
	const { policy } = input;
	const { choiceScope } = policy;
	if (choiceScope.length === 0) {
		return deriveAcknowledgementRequirement(input, categories);
	}
	if (
		hasChoiceRefusal(policy, categories) ||
		rightsAcknowledgedUntil(input) !== undefined
	) {
		return { kind: 'none' };
	}
	const decisions = input.choice?.categories;
	if (!decisions || Object.keys(decisions).length === 0) {
		return requirement('choice', 'missing');
	}
	let missing = false;
	let expired = false;
	for (const category of choiceScope) {
		const decision = decisions[category];
		const { authority } = categories[category];
		if (authority === 'policy-changed') {
			return requirement('choice', 'policy-changed');
		}
		if (!decision) {
			missing = true;
		} else if (decision.value && authority === 'expired') {
			expired = true;
		}
	}
	if (missing) {
		return requirement('choice', 'missing');
	}
	if (expired) {
		return requirement('choice', 'expired');
	}
	return { kind: 'none' };
};

const noticeExpiry = function noticeExpiry(
	dismissal: NoticeDismissal,
	policy: EvaluationPolicy
): number | null {
	return policy.notice.maxAgeMs === null
		? null
		: dismissal.dismissedAt + policy.notice.maxAgeMs;
};

/** Notice prompts depend only on the dismissal's fingerprint and lifetime. */
const deriveNoticeRequirement = function deriveNoticeRequirement(
	input: ConsentEvaluationInput
): PromptRequirement {
	const dismissal = input.noticeDismissal;
	if (!dismissal) {
		return requirement('notice', 'missing');
	}
	if (dismissal.fingerprint !== input.policy.notice.fingerprint) {
		return requirement('notice', 'policy-changed');
	}
	const expiresAt = noticeExpiry(dismissal, input.policy);
	if (expiresAt !== null && input.now >= expiresAt) {
		return requirement('notice', 'expired');
	}
	return { kind: 'none' };
};

const derivePromptRequirement = function derivePromptRequirement(
	input: ConsentEvaluationInput,
	categories: Record<OptionalConsentCategory, CategoryEvaluation>
): PromptRequirement {
	switch (input.policy.prompt) {
		case 'choice':
			return deriveChoiceRequirement(input, categories);
		case 'notice':
			return deriveNoticeRequirement(input);
		default:
			return { kind: 'none' };
	}
};

/**
 * When an acknowledged choice prompt asks again: for an empty choice scope,
 * once the last record answering it runs out; otherwise once the
 * acknowledgement does, so the remaining categories are asked for. Empty
 * when it is not answered or never runs out.
 */
const acknowledgementDeadline = function acknowledgementDeadline(
	input: ConsentEvaluationInput,
	categories: Record<OptionalConsentCategory, CategoryEvaluation>,
	promptRequirement: PromptRequirement
): number[] {
	const { policy } = input;
	if (policy.prompt !== 'choice' || promptRequirement.kind !== 'none') {
		return [];
	}
	const until =
		policy.choiceScope.length > 0
			? rightsAcknowledgedUntil(input)
			: acknowledgedUntil(input, categories);
	return typeof until === 'number' ? [until] : [];
};

const grantExpiryChangesPermission = function grantExpiryChangesPermission(
	policy: EvaluationPolicy,
	category: OptionalConsentCategory,
	optOutDenied: readonly OptionalConsentCategory[],
	evaluation: CategoryEvaluation
): boolean {
	return (
		evaluation.restrictions.length === 0 &&
		(!defaultPermission(policy, true) || optOutDenied.includes(category))
	);
};

/**
 * Earliest future time at which permissions or the prompt can change.
 * A positive in-scope grant matters when its expiry changes a permission
 * (opt-in, IAB, or a non-deciding grant standing over a durable opt-out)
 * or a choice prompt; a dismissal matters under a notice prompt, and as an
 * acknowledgement under a choice prompt with an empty choice scope.
 */
const deriveNextDeadline = function deriveNextDeadline(
	input: ConsentEvaluationInput,
	categories: Record<OptionalConsentCategory, CategoryEvaluation>,
	promptRequirement: PromptRequirement
): number | null {
	const { policy } = input;
	const candidates: number[] = [];
	const { choiceScope } = policy;
	// Expiry can only change a choice prompt from satisfied to expired.
	// Missing coverage or a mismatch keeps precedence over later expiry.
	const choicePromptCanChange =
		policy.prompt === 'choice' &&
		promptRequirement.kind === 'none' &&
		!hasChoiceRefusal(policy, categories);
	const optOutDenied = input.optOut
		? optOutDenyCategories(policy, input.optOut)
		: [];
	for (const category of policy.scope) {
		const evaluation = categories[category];
		const decision = input.choice?.categories[category];
		if (
			decision?.value === true &&
			evaluation.authority === 'valid' &&
			evaluation.expiresAt !== null &&
			(grantExpiryChangesPermission(
				policy,
				category,
				optOutDenied,
				evaluation
			) ||
				(choicePromptCanChange && choiceScope.includes(category)))
		) {
			candidates.push(evaluation.expiresAt);
		}
	}
	candidates.push(
		...acknowledgementDeadline(input, categories, promptRequirement)
	);
	const dismissal = input.noticeDismissal;
	if (
		policy.prompt === 'notice' &&
		dismissal &&
		dismissal.fingerprint === policy.notice.fingerprint
	) {
		const expiresAt = noticeExpiry(dismissal, policy);
		if (expiresAt !== null && expiresAt > input.now) {
			candidates.push(expiresAt);
		}
	}
	const future = candidates.filter((candidate) => candidate > input.now);
	return future.length === 0 ? null : Math.min(...future);
};

/** Evaluates one snapshot of records against one policy at `now`. */
export const evaluateConsentRecord = function evaluateConsentRecord(
	input: ConsentEvaluationInput
): ConsentEvaluation {
	const categories = {} as Record<OptionalConsentCategory, CategoryEvaluation>;
	const permissions = { necessary: true } as Record<ConsentCategory, boolean>;
	const restrictions: Partial<
		Record<OptionalConsentCategory, readonly RestrictionReason[]>
	> = {};

	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const evaluation = evaluateCategory(category, input);
		categories[category] = evaluation;
		permissions[category] = evaluation.permitted;
		if (evaluation.restrictions.length > 0) {
			restrictions[category] = evaluation.restrictions;
		}
	}

	const promptRequirement = derivePromptRequirement(input, categories);
	return {
		categories,
		nextDeadline: deriveNextDeadline(input, categories, promptRequirement),
		permissions,
		promptRequirement,
		restrictions,
	};
};
