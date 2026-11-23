/**
 * Whether a stored category decision still has authority under a policy.
 *
 * A leaf module: the evaluator decides permissions with it, and consent
 * surfaces read what a control shows with it, without reaching the
 * evaluator itself.
 *
 * @internal
 */

import type {
	CategoryDecision,
	DecisionAuthority,
	EvaluationPolicy,
} from './types';

/**
 * Whether a decision's basis is compatible with the current policy.
 * Legacy decisions without a material fingerprint are grandfathered, and
 * a legacy fingerprint is only compared to a legacy material fingerprint.
 */
export const isBasisCompatible = function isBasisCompatible(
	decision: CategoryDecision,
	policy: EvaluationPolicy
): boolean {
	const { basis } = decision;
	if (basis.kind === 'choice-v1') {
		return basis.fingerprint === policy.choice.fingerprint;
	}
	if (
		basis.materialFingerprint === undefined ||
		policy.legacyMaterialFingerprint === null
	) {
		return true;
	}
	return basis.materialFingerprint === policy.legacyMaterialFingerprint;
};

const decisionExpiry = function decisionExpiry(
	decision: CategoryDecision,
	policy: EvaluationPolicy
): number | null {
	return policy.choice.maxAgeMs === null
		? null
		: decision.confirmedAt + policy.choice.maxAgeMs;
};

/**
 * Whether a stored decision still has authority under `policy` at `now`.
 *
 * @internal
 */
export const decisionAuthority = function decisionAuthority(
	decision: CategoryDecision | undefined,
	policy: EvaluationPolicy,
	now: number
): { authority: DecisionAuthority; expiresAt: number | null } {
	if (!decision) {
		return { authority: 'absent', expiresAt: null };
	}
	if (!isBasisCompatible(decision, policy)) {
		return { authority: 'policy-changed', expiresAt: null };
	}
	const expiresAt = decisionExpiry(decision, policy);
	if (expiresAt !== null && now >= expiresAt) {
		return { authority: 'expired', expiresAt };
	}
	return { authority: 'valid', expiresAt };
};

/**
 * Whether a stored decision still answers the choice prompt for its
 * category at `now`, as the evaluator reads it: a refusal holds until a
 * policy edit, a grant until it expires or a policy edit. An absent
 * decision answers nothing.
 *
 * @internal
 */
export const decisionAnswersPrompt = function decisionAnswersPrompt(
	decision: CategoryDecision | undefined,
	policy: EvaluationPolicy,
	now: number
): boolean {
	if (!decision) {
		return false;
	}
	const { authority } = decisionAuthority(decision, policy, now);
	return authority === 'valid' || (authority === 'expired' && !decision.value);
};
