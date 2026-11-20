/**
 * Pure opt-out helpers shared across the evaluator, kernel and surface state:
 * categories switched off by a durable opt-out, the 12-month reprompt window,
 * and why an opt-out cannot be lifted locally.
 *
 * @internal
 */

import type { OptOutRecord } from '@inth/sdk-schema/types';

import type { EvaluationPolicy, OptionalConsentCategory } from './types';

const OPT_OUT_DENY_CATEGORIES = [
	'marketing',
	'measurement',
] as const satisfies readonly OptionalConsentCategory[];

/**
 * Minimum wait before asking a visitor who opted out to opt back in.
 * Uses 366 days in milliseconds so a leap year is still at least 12 months
 * under California regulations (section 7026(k)).
 */
export const OPT_OUT_REPROMPT_WAIT_MS = 366 * 86_400_000;

/**
 * Earliest epoch millisecond from which an opt-in prompt is allowed for an
 * opt-out record.
 */
export const optInPromptAllowedAt = function optInPromptAllowedAt(
	optOut: Pick<OptOutRecord, 'recordedAt'>
): number {
	return optOut.recordedAt + OPT_OUT_REPROMPT_WAIT_MS;
};

/**
 * Optional categories that a durable opt-out record switches off under
 * `policy`: `marketing` and `measurement`, filtered to `policy.scope`.
 *
 * Kept as the single place that defines the set so a later policy-rule field
 * can replace it without touching callers.
 */
export const optOutDenyCategories = function optOutDenyCategories(
	policy: Pick<EvaluationPolicy, 'scope'>
): OptionalConsentCategory[] {
	return OPT_OUT_DENY_CATEGORIES.filter((category) =>
		policy.scope.includes(category)
	);
};

/** Snapshot fields read by {@link optOutLiftBlocker}. */
export interface OptOutLiftSnapshot {
	readonly evaluationPolicy: Pick<EvaluationPolicy, 'gpcDenyCategories'>;
	readonly optOut: Readonly<OptOutRecord> | null;
	readonly privacySignals: { readonly gpc: { readonly active: boolean } };
}

/**
 * Reason an opt-out cannot be lifted locally, or `null` when it can.
 *
 * `held-by-account` tells `commands.optIn()` and `commands.save()` to ask
 * the backend to lift the account's opt-out instead of clearing it locally.
 */
export const optOutLiftBlocker = function optOutLiftBlocker(
	snapshot: OptOutLiftSnapshot
): 'not-opted-out' | 'gpc-active' | 'held-by-account' | null {
	const { optOut } = snapshot;
	if (!optOut) {
		return 'not-opted-out';
	}
	if (
		snapshot.privacySignals.gpc.active &&
		snapshot.evaluationPolicy.gpcDenyCategories.length > 0
	) {
		return 'gpc-active';
	}
	if (optOut.heldBy === 'person' || optOut.heldBy === 'both') {
		return 'held-by-account';
	}
	return null;
};
