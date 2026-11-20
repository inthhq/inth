/**
 * Headless opt-out display state derived from a consent snapshot.
 *
 * Pure and engine-free so every framework surface can import it from
 * `@inth/sdk/surface-state` without pulling in the kernel or evaluator.
 */

import {
	optInPromptAllowedAt,
	optOutDenyCategories,
	optOutLiftBlocker,
} from '../consent-record/opt-out';
import type { OptionalConsentCategory } from '../consent-record/types';
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
	/** Earliest time an opt-in prompt is allowed (the 12-month rule), or null. */
	optInPromptAllowedAt: number | null;
}

/**
 * Derive what an opt-out confirmation or preference surface shows from a
 * consent snapshot.
 *
 * @param snapshot - The current consent snapshot.
 * @returns The availability, honored status, source, lock reason, affected
 * categories and 12-month reprompt timestamp.
 */
export const resolveOptOutState = function resolveOptOutState(
	snapshot: Pick<
		ConsentSnapshot,
		'evaluationPolicy' | 'optOut' | 'privacySignals'
	>
): ResolvedOptOutState {
	const available = snapshot.evaluationPolicy.model === 'opt-out';
	const categories = optOutDenyCategories(snapshot.evaluationPolicy);
	const { optOut } = snapshot;
	if (!optOut) {
		return {
			available,
			categories,
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
		honored: true,
		lock,
		optInPromptAllowedAt: optInPromptAllowedAt(optOut),
		via,
	};
};
