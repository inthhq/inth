@file:JvmName("ConsentFlows")

package com.inth.android

import com.inth.core.CommitIntent
import com.inth.core.CommitResult
import com.inth.core.ConsentCore
import com.inth.core.FlushResult
import com.inth.core.OptInResult
import com.inth.core.OptOutResult
import com.inth.core.Subscription
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentDecision
import com.inth.core.model.ConsentSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.WeakHashMap
import kotlin.coroutines.resume

/**
 * The core's snapshot as a [StateFlow].
 *
 * `value` is the current snapshot, so a Compose screen reads it with
 * `collectAsState()` and needs no initial value. Every call on the same core returns
 * the same instance, which keeps `collectAsState()` stable across recompositions.
 *
 * Collectors run in their own context: one started from Compose, `lifecycleScope` or
 * `viewModelScope` receives on the main thread with no hop. Like every [StateFlow] it
 * conflates, so a slow collector sees the latest snapshot rather than each revision.
 * A host that must act on every revision uses [ConsentCore.onChange] instead.
 *
 * ```kotlin
 * val snapshot by core.snapshotFlow.collectAsState()
 * Text(if (snapshot.isReady) "Privacy choices ready" else "Loading privacy choices")
 * ```
 */
val ConsentCore.snapshotFlow: StateFlow<ConsentSnapshot>
	get() = SnapshotFlows.of(this).snapshot

/**
 * One category's [ConsentDecision] as a [StateFlow].
 *
 * Emits only when the decision changes, the same dedupe [ConsentCore.gateDecision]
 * applies: five snapshots that leave the answer at `PENDING` emit one `PENDING`.
 * `value` is the current decision, and the same category on the same core returns
 * the same instance.
 *
 * ```kotlin
 * val measurement by core.decisionFlow(ConsentCategory.MEASUREMENT).collectAsState()
 * ```
 */
fun ConsentCore.decisionFlow(category: ConsentCategory): StateFlow<ConsentDecision> =
	SnapshotFlows.of(this).decision(category)

/**
 * [ConsentCore.save] as a suspend function, run on [Dispatchers.IO].
 *
 * The save is a durable write, so it never runs on the caller's thread. Cancelling
 * the caller does not cancel a save that has started: the decision is either
 * committed whole or refused whole, and the result is dropped.
 *
 * @return The same [CommitResult] the blocking call returns.
 */
suspend fun ConsentCore.awaitSave(
	intent: CommitIntent,
	expectedRevision: Long? = null,
): CommitResult = withContext(Dispatchers.IO) { save(intent, expectedRevision) }

/**
 * [ConsentCore.refresh], suspended until the init has landed.
 *
 * When this returns, [snapshotFlow] already holds the refreshed snapshot. A failed init
 * returns normally too; its error reaches [ConsentCore.onError]. Cancelling the caller
 * stops the wait, not the init.
 */
suspend fun ConsentCore.awaitRefresh() {
	suspendCancellableCoroutine { continuation ->
		refresh { continuation.resume(Unit) }
	}
}

/**
 * [ConsentCore.flushPending] as a suspend function, run on [Dispatchers.IO].
 *
 * A delivery pass sends queued saves over the network, so it never runs on the
 * caller's thread. Cancelling the caller does not stop a pass that has started.
 */
suspend fun ConsentCore.awaitFlushPending(): FlushResult =
	withContext(Dispatchers.IO) { flushPending() }

/**
 * [ConsentCore.optOut] as a suspend function, run on [Dispatchers.IO].
 *
 * Recording an opt-out performs a durable write, so it never runs on the caller's
 * thread. Cancelling the caller does not cancel an opt-out that has started: the
 * record is either persisted whole or refused whole, and the result is dropped.
 *
 * @return The same [OptOutResult] the blocking call returns.
 */
suspend fun ConsentCore.awaitOptOut(): OptOutResult =
	withContext(Dispatchers.IO) { optOut() }

/**
 * [ConsentCore.optIn] as a suspend function, run on [Dispatchers.IO].
 *
 * Lifting a device-held opt-out performs a durable write, and lifting an account-held
 * opt-out (`person` or `both`) stores the lift in the opt-out queue and waits for the
 * backend's answer, so this never runs on the caller's thread. An account lift that does
 * not reach the backend stays queued and replays with the same idempotency key.
 * Cancelling the caller does not stop a lift that has started.
 *
 * @return The same [OptInResult] the blocking call returns.
 */
suspend fun ConsentCore.awaitOptIn(): OptInResult =
	withContext(Dispatchers.IO) { optIn() }

/**
 * The hot flows for one core, created on first use and kept for the core's lifetime.
 *
 * Nothing here holds the core. The core holds the [publish] callback until
 * [subscription] closes, which it never does: the flows follow the core for its
 * lifetime. [byCore] holds this object only while the core is reachable, so an
 * uninstalled core and its flows are collected together.
 */
internal class SnapshotFlows private constructor(initial: ConsentSnapshot) {
	private val mutableSnapshot = MutableStateFlow(initial)
	private val mutableDecisions: Map<ConsentCategory, MutableStateFlow<ConsentDecision>> =
		ConsentCategory.entries.associateWith { MutableStateFlow(initial.decision(it)) }
	private val decisions: Map<ConsentCategory, StateFlow<ConsentDecision>> =
		mutableDecisions.mapValues { (_, flow) -> flow.asStateFlow() }

	val snapshot: StateFlow<ConsentSnapshot> = mutableSnapshot.asStateFlow()

	fun decision(category: ConsentCategory): StateFlow<ConsentDecision> = decisions.getValue(category)

	/** The core's registration for [publish]. Kept open for the core's lifetime. */
	private var subscription: Subscription? = null

	/**
	 * Take [next] unless a newer revision already arrived.
	 *
	 * The core reads the snapshot it hands observers at notify time, so two publishing
	 * threads can deliver out of order. Revisions only move forward within a core, so
	 * the guard keeps the flow from stepping back to an older state.
	 */
	private fun publish(next: ConsentSnapshot) = synchronized(this) {
		if (next.revision < mutableSnapshot.value.revision) return
		mutableSnapshot.value = next
		for ((category, flow) in mutableDecisions) {
			flow.value = next.decision(category)
		}
	}

	companion object {
		private val byCore = WeakHashMap<ConsentCore, SnapshotFlows>()

		fun of(core: ConsentCore): SnapshotFlows = synchronized(byCore) {
			byCore.getOrPut(core) {
				SnapshotFlows(core.snapshot()).also { flows ->
					// Register before the second read: a change that lands between the
					// two reaches the observer, and the read below cannot step back
					// past it because of the revision guard.
					flows.subscription = core.onChange(flows::publish)
					flows.publish(core.snapshot())
				}
			}
		}
	}
}
