/**
 * Pure opt-out timing and liftability helpers shared across the evaluator,
 * kernel and surface state. Kept out of `./types.ts` so first-load callers
 * of `optOutDecidingCategory` (instant-commit) do not pull these in.
 *
 * @internal
 */

import type { OptOutRecord } from '@inth/sdk-schema/types';

import type { AllConsentNames } from '../consent/consent-types';
import {
	LEGACY_OPT_OUT_CATEGORIES,
	OPTIONAL_CONSENT_CATEGORIES,
	optOutDecidingCategory,
	policyOptOutCategories,
} from './types';
import type { EvaluationPolicy, OptionalConsentCategory } from './types';

/**
 * Optional categories a held opt-out switches off under `policy`, in
 * decision order: what the policy maps today plus what the record was made
 * with, filtered to `policy.scope`. A record without its own list was made
 * before the mapping was configurable and withholds
 * {@link LEGACY_OPT_OUT_CATEGORIES}. Taking the union means a policy that
 * narrows its mapping never silently lifts a right a visitor already holds.
 *
 * Without `optOut`, returns the policy's part alone.
 */
export const optOutDenyCategories = function optOutDenyCategories(
	policy: Pick<EvaluationPolicy, 'gpcDenyCategories' | 'scope'>,
	optOut?: {
		readonly categories?: readonly OptionalConsentCategory[];
	} | null
): OptionalConsentCategory[] {
	if (!optOut) {
		return policyOptOutCategories(policy);
	}
	const mapped =
		policy.gpcDenyCategories.length > 0
			? policy.gpcDenyCategories
			: LEGACY_OPT_OUT_CATEGORIES;
	// Never empty, so the policy fallback cannot replace the union.
	return policyOptOutCategories({
		gpcDenyCategories: [
			...mapped,
			...(optOut.categories ?? LEGACY_OPT_OUT_CATEGORIES),
		],
		scope: policy.scope,
	});
};

/**
 * Joins the categories two copies of a held opt-out withhold, in canonical
 * category order. A missing list is a record stored before opt-outs kept
 * their own, and stands for {@link LEGACY_OPT_OUT_CATEGORIES}: a copy is
 * never read as withholding less than that. Returns `undefined` (legacy)
 * when the join adds nothing to the legacy list, so a legacy record stays
 * legacy.
 */
export const unionOptOutCategories = function unionOptOutCategories(
	left: readonly OptionalConsentCategory[] | undefined,
	right: readonly OptionalConsentCategory[] | undefined
): OptionalConsentCategory[] | undefined {
	if (left === undefined && right === undefined) {
		return undefined;
	}
	const joined = new Set<OptionalConsentCategory>([
		...(left ?? LEGACY_OPT_OUT_CATEGORIES),
		...(right ?? LEGACY_OPT_OUT_CATEGORIES),
	]);
	if (
		(left === undefined || right === undefined) &&
		[...joined].every((category) =>
			(LEGACY_OPT_OUT_CATEGORIES as readonly string[]).includes(category)
		)
	) {
		return undefined;
	}
	return OPTIONAL_CONSENT_CATEGORIES.filter((category) => joined.has(category));
};

/**
 * Whether `answer`, an opt-out record the backend sent, describes the act
 * `held` records: the same time and method, or a record the backend says
 * this device alone holds. The backend never carries `categories`, so such
 * an answer takes the held record's list; any other answer is a separate
 * opt-out and joins it.
 */
export const answersHeldOptOut = function answersHeldOptOut(
	answer: Pick<OptOutRecord, 'heldBy' | 'method' | 'recordedAt'>,
	held: Pick<OptOutRecord, 'method' | 'recordedAt'>
): boolean {
	return (
		answer.heldBy === 'device' ||
		(answer.recordedAt === held.recordedAt && answer.method === held.method)
	);
};

/**
 * `kept` with the categories both copies of a held opt-out withhold, where
 * `other` is the copy that lost. When the two describe the same act
 * (`sameAct`, see {@link answersHeldOptOut}) and one has no list, it is the
 * backend's copy, which never carries one, so the other's list stands.
 * Otherwise the lists join with {@link unionOptOutCategories}: no copy
 * makes the browser withhold less than another did.
 */
export const carryOptOutCategories = function carryOptOutCategories(
	kept: OptOutRecord,
	other: Readonly<OptOutRecord> | null | undefined,
	sameAct: boolean
): OptOutRecord {
	if (!other || kept === other) {
		return kept;
	}
	const categories =
		sameAct && (kept.categories === undefined || other.categories === undefined)
			? (kept.categories ?? other.categories)
			: unionOptOutCategories(kept.categories, other.categories);
	if (
		categories === kept.categories ||
		(categories !== undefined &&
			kept.categories !== undefined &&
			categories.length === kept.categories.length &&
			categories.every(
				(category, index) => category === kept.categories?.[index]
			))
	) {
		return kept;
	}
	if (categories === undefined) {
		const { categories: _dropped, ...legacy } = kept;
		return legacy;
	}
	return { ...kept, categories: [...categories] };
};

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

/** Snapshot fields read by {@link saveWouldLiftOptOut}. */
export interface SaveOptOutLiftSnapshot extends OptOutLiftSnapshot {
	readonly evaluationPolicy: Pick<
		EvaluationPolicy,
		'choiceScope' | 'gpcDenyCategories' | 'model' | 'scope'
	>;
}

/**
 * Whether a category save would attempt to lift a held opt-out under an
 * opt-out policy.
 *
 * Uses the kernel's deciding-category and lift-blocker rules. Returns `true`
 * when the active model is `opt-out`, a durable opt-out is held, Global
 * Privacy Control is not blocking the lift, and the save grants the deciding
 * category (`marketing`, else `measurement`). Under an `opt-in` policy,
 * returns `false` so accepts keep lifting in one step.
 *
 * Account-held opt-outs return `true` when GPC is off because a save that
 * grants the deciding category requests a backend lift, which succeeds for a
 * verified account and therefore requires two-step confirmation under
 * 11 CCR §7028(a).
 */
export const saveWouldLiftOptOut = function saveWouldLiftOptOut(
	snapshot: SaveOptOutLiftSnapshot,
	input:
		| 'all'
		| 'none'
		| (Partial<Record<AllConsentNames, boolean>> & {
				vendors?: Record<string, boolean>;
		  }),
	categories?: readonly AllConsentNames[]
): boolean {
	if (snapshot.evaluationPolicy.model !== 'opt-out') {
		return false;
	}
	const blocker = optOutLiftBlocker(snapshot);
	if (blocker === 'not-opted-out' || blocker === 'gpc-active') {
		return false;
	}
	const deciding = optOutDecidingCategory(snapshot.evaluationPolicy);
	if (deciding === null) {
		return false;
	}
	if (input === 'all') {
		return (
			snapshot.evaluationPolicy.choiceScope.includes(deciding) &&
			(categories === undefined || categories.includes(deciding))
		);
	}
	if (input === 'none') {
		return false;
	}
	return input[deciding] === true;
};
