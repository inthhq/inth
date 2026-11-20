/**
 * Categories switched off by a durable opt-out record.
 *
 * @internal
 */

import type { EvaluationPolicy, OptionalConsentCategory } from './types';

const OPT_OUT_DENY_CATEGORIES = [
	'marketing',
	'measurement',
] as const satisfies readonly OptionalConsentCategory[];

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
