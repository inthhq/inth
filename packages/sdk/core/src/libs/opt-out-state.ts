/**
 * Headless opt-out display state derived from a consent snapshot.
 *
 * Pure and engine-free so every framework surface can import it from
 * `@inth/sdk/surface-state` without pulling in the kernel or evaluator.
 */

import {
	optInPromptAllowedAt,
	optOutLiftBlocker,
} from '../consent-record/opt-out-rules';
import {
	optOutDecidingCategory,
	optOutDenyCategories,
} from '../consent-record/types';
import type {
	EvaluationPolicy,
	OptionalConsentCategory,
} from '../consent-record/types';
import type { AllConsentNames } from '../consent/consent-types';
import type { ConsentSnapshot } from '../types';

/** How an honored opt-out was recorded or is currently enforced. */
export type OptOutVia = 'signal' | 'request';

/** Why this browser cannot lift the opt-out right now. */
export type OptOutLock = 'gpc-active' | 'held-by-account';

/** What an opt-out surface shows from a consent snapshot. */
export interface ResolvedOptOutState {
	/** The active rule offers the opt-out (its model is `opt-out`). */
	available: boolean;
	/** A record is held: the request was honored. */
	honored: boolean;
	/** How it was honored: a GPC signal, or the visitor's own request. Null when not honored. */
	via: OptOutVia | null;
	/** Why this browser cannot lift it right now, or null. */
	lock: OptOutLock | null;
	/** Categories the opt-out switches off under the active rule. */
	categories: OptionalConsentCategory[];
	/** Category that decides an opt-out under the active rule, or null. */
	decidingCategory: OptionalConsentCategory | null;
	/** Earliest time an opt-in prompt is allowed (the 12-month rule), or null. */
	optInPromptAllowedAt: number | null;
}

/**
 * Derive what an opt-out confirmation or preference surface shows from a
 * consent snapshot.
 *
 * @param snapshot - The current consent snapshot.
 * @returns The availability, honored status, source, lock reason, affected
 * categories, deciding category and 12-month reprompt timestamp.
 */
export const resolveOptOutState = function resolveOptOutState(
	snapshot: Pick<
		ConsentSnapshot,
		'evaluationPolicy' | 'optOut' | 'privacySignals'
	>
): ResolvedOptOutState {
	const available = snapshot.evaluationPolicy.model === 'opt-out';
	const categories = optOutDenyCategories(snapshot.evaluationPolicy);
	const decidingCategory = optOutDecidingCategory(snapshot.evaluationPolicy);
	const { optOut } = snapshot;
	if (!optOut) {
		return {
			available,
			categories,
			decidingCategory,
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			via: null,
		};
	}
	const blocker = optOutLiftBlocker(snapshot);
	const lock: OptOutLock | null = blocker === 'not-opted-out' ? null : blocker;
	const via: OptOutVia =
		optOut.method === 'gpc' || lock === 'gpc-active' ? 'signal' : 'request';
	return {
		available,
		categories,
		decidingCategory,
		honored: true,
		lock,
		optInPromptAllowedAt: optInPromptAllowedAt(optOut),
		via,
	};
};

/** Snapshot fields read by {@link resolveCategoryOptOutLock}. */
export type CategoryOptOutLockSnapshot = Pick<
	ConsentSnapshot,
	'evaluationPolicy' | 'optOut' | 'privacySignals' | 'restrictions'
>;

/**
 * Answer why one category's preference switch is locked or annotated for an
 * opt-out or privacy signal, or `null` when it is neither.
 *
 * - `'gpc-active'` when the category carries a live `gpc` restriction, or when
 *   the opt-out lock is `'gpc-active'` and the category is the deciding one.
 * - `'held-by-account'` when the opt-out lock is `'held-by-account'` and the
 *   category is the deciding one.
 * - `null` otherwise.
 */
export const resolveCategoryOptOutLock = function resolveCategoryOptOutLock(
	snapshot: CategoryOptOutLockSnapshot,
	category: AllConsentNames
): OptOutLock | null {
	if (category === 'necessary') {
		return null;
	}
	if (snapshot.restrictions[category]?.includes('gpc') === true) {
		return 'gpc-active';
	}
	const state = resolveOptOutState(snapshot);
	if (state.decidingCategory === category && state.lock !== null) {
		return state.lock;
	}
	return null;
};

/** Snapshot fields read by {@link isOptedOut}. */
export interface OptOutCheckSnapshot {
	readonly effectivePermissions: ConsentSnapshot['effectivePermissions'];
	readonly evaluationPolicy: Pick<EvaluationPolicy, 'scope'>;
	readonly optOut: ConsentSnapshot['optOut'];
}

/**
 * Answer whether the visitor is opted out of sale, sharing and targeted
 * advertising right now.
 *
 * Returns `true` when an opt-out record is held. Otherwise, when `categories`
 * is passed, returns `true` when any listed category is not permitted in
 * `effectivePermissions`. When `categories` is omitted, checks
 * {@link optOutDecidingCategory} for the active policy (returns `false` when
 * none is in scope). Passing `categories` overrides only the category check; a
 * held opt-out record still returns `true`.
 *
 * @param snapshot - The current consent snapshot.
 * @param categories - Optional override for the categories checked when no
 * opt-out record is held.
 * @returns `true` when sale, sharing and targeted advertising are opted out.
 */
export const isOptedOut = function isOptedOut(
	snapshot: OptOutCheckSnapshot,
	categories?: readonly AllConsentNames[]
): boolean {
	if (snapshot.optOut !== null) {
		return true;
	}
	if (categories !== undefined) {
		return categories.some(
			(category) => snapshot.effectivePermissions[category] !== true
		);
	}
	const deciding = optOutDecidingCategory(snapshot.evaluationPolicy);
	return deciding !== null && snapshot.effectivePermissions[deciding] !== true;
};
