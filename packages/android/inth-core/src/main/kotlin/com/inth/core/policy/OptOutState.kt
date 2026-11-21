package com.inth.core.policy

import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentModel
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.OptOutHolder
import com.inth.core.model.OptOutMethod
import com.inth.core.model.OptOutRecord

/**
 * Minimum wait before asking a visitor who opted out to opt back in.
 * Uses 366 days in milliseconds so a leap year is still at least 12 months
 * under California regulations (section 7026(k)).
 */
const val OPT_OUT_REPROMPT_WAIT_MS: Long = 366L * 86_400_000L

/** How an honored opt-out was recorded or is currently enforced. */
enum class OptOutVia(val wireName: String) {
	SIGNAL("signal"),
	REQUEST("request"),
}

/** Why this device cannot lift the opt-out locally right now. */
enum class OptOutLock(val wireName: String) {
	GPC_ACTIVE("gpc-active"),
	HELD_BY_ACCOUNT("held-by-account"),
}

/**
 * Headless opt-out display state derived from a [ConsentSnapshot] and its active [EvaluationPolicy].
 *
 * Port of `ResolvedOptOutState` in `packages/sdk/core/src/libs/opt-out-state.ts`.
 */
data class ResolvedOptOutState(
	/** The active rule offers the opt-out (its model is `opt-out`). */
	val available: Boolean,
	/** A record is held: the request or signal was honored. */
	val honored: Boolean,
	/** How it was honored: a GPC signal, or the visitor's own request. `null` when not honored. */
	val via: OptOutVia?,
	/** Why this device cannot lift it locally right now, or `null`. */
	val lock: OptOutLock?,
	/** Categories the opt-out switches off under the active rule. */
	val categories: List<ConsentCategory>,
	/** Category that decides an opt-out under the active rule, or `null`. */
	val decidingCategory: ConsentCategory?,
	/** Earliest time an opt-in prompt is allowed (the 12-month rule), or `null`. */
	val optInPromptAllowedAt: Long?,
)

/**
 * Derive what an opt-out confirmation or preference surface shows from [snapshot] and [policy].
 *
 * Port of `resolveOptOutState` in `packages/sdk/core/src/libs/opt-out-state.ts`.
 */
fun resolveOptOutState(
	snapshot: ConsentSnapshot,
	policy: EvaluationPolicy?,
): ResolvedOptOutState {
	val activePolicy = if (snapshot.policyPending) null else policy
	val available = activePolicy?.model == ConsentModel.OPT_OUT
	val categories = PolicyEvaluator.optOutDenyCategories(activePolicy)
	val decidingCategory = PolicyEvaluator.optOutDecidingCategory(activePolicy)
	val optOut = snapshot.optOut ?: return ResolvedOptOutState(
		available = available,
		honored = false,
		via = null,
		lock = null,
		categories = categories,
		decidingCategory = decidingCategory,
		optInPromptAllowedAt = null,
	)
	val lock = optOutLock(snapshot, activePolicy, optOut)
	val via = if (optOut.method == OptOutMethod.GPC || lock == OptOutLock.GPC_ACTIVE) {
		OptOutVia.SIGNAL
	} else {
		OptOutVia.REQUEST
	}
	return ResolvedOptOutState(
		available = available,
		honored = true,
		via = via,
		lock = lock,
		categories = categories,
		decidingCategory = decidingCategory,
		optInPromptAllowedAt = optOut.recordedAt + OPT_OUT_REPROMPT_WAIT_MS,
	)
}

/**
 * Answer why one category's preference switch is locked or annotated for an opt-out
 * or privacy signal, or `null` when it is neither.
 *
 * Port of `resolveCategoryOptOutLock` in `packages/sdk/core/src/libs/opt-out-state.ts`:
 * - [OptOutLock.GPC_ACTIVE] when the category carries a live `gpc` restriction, or when
 *   the opt-out lock is [OptOutLock.GPC_ACTIVE] and the category is the deciding one.
 * - [OptOutLock.HELD_BY_ACCOUNT] when the opt-out lock is [OptOutLock.HELD_BY_ACCOUNT]
 *   and the category is the deciding one.
 * - `null` otherwise.
 */
fun resolveCategoryOptOutLock(
	snapshot: ConsentSnapshot,
	policy: EvaluationPolicy?,
	category: ConsentCategory,
): OptOutLock? = resolveCategoryOptOutLock(snapshot, resolveOptOutState(snapshot, policy), category)

/** Overload for callers that already resolved [state] from the same snapshot and policy. */
fun resolveCategoryOptOutLock(
	snapshot: ConsentSnapshot,
	state: ResolvedOptOutState,
	category: ConsentCategory,
): OptOutLock? {
	if (!category.optional) {
		return null
	}
	if (PolicyEvaluator.RESTRICTION_GPC in snapshot.restrictions[category.wireName].orEmpty()) {
		return OptOutLock.GPC_ACTIVE
	}
	if (state.decidingCategory == category && state.lock != null) {
		return state.lock
	}
	return null
}

private fun optOutLock(
	snapshot: ConsentSnapshot,
	policy: EvaluationPolicy?,
	optOut: OptOutRecord,
): OptOutLock? {
	if (snapshot.privacySignals.gpc.active && policy?.gpcDenyCategories?.isNotEmpty() == true) {
		return OptOutLock.GPC_ACTIVE
	}
	if (optOut.heldBy == OptOutHolder.PERSON || optOut.heldBy == OptOutHolder.BOTH) {
		return OptOutLock.HELD_BY_ACCOUNT
	}
	return null
}

/**
 * Answer whether the visitor is opted out of sale, sharing and targeted advertising right now.
 *
 * Port of `isOptedOut` in `packages/sdk/core/src/libs/opt-out-state.ts`: returns `true` when
 * a durable opt-out record is held. Otherwise, when [categories] is non-null, returns `true`
 * when any listed category is not permitted in `effectivePermissions`. When [categories] is
 * `null`, checks [PolicyEvaluator.optOutDecidingCategory] for [policy] (returns `false` when
 * none is in scope). Passing [categories] overrides only the category check; a held opt-out
 * record still returns `true`.
 */
fun isOptedOut(
	snapshot: ConsentSnapshot,
	policy: EvaluationPolicy?,
	categories: List<ConsentCategory>? = null,
): Boolean {
	if (snapshot.optOut != null) {
		return true
	}
	if (categories != null) {
		return categories.any { !snapshot.effectivePermissions[it] }
	}
	val deciding = PolicyEvaluator.optOutDecidingCategory(policy)
	return deciding != null && !snapshot.effectivePermissions[deciding]
}
