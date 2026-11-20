package com.inth.core

import com.inth.core.model.KernelError
import com.inth.core.model.OptOutRecord

/**
 * Outcome of [ConsentCore.save].
 *
 * [ok] is the answer to "is this decision committed on this device", which is a
 * device-side claim with three parts: the receipts are applied to the snapshot, the
 * snapshot is written to protected storage, and the queue holds the exact bytes that owe
 * delivery. It says nothing about the backend, which no synchronous call could know from
 * here. A commit made on a plane is `ok = true, queued = true, delivered = false` and
 * gates correctly, and its delivery is reported later, when the queue drains.
 *
 * Under `NativeConfig.dryRun` the first two parts hold and the third does not: the
 * record is dropped, so the result is `ok = true, queued = false`.
 *
 * A refusal changes none of the three. [revision] is the snapshot the decision was
 * *not* applied to, so a caller that renders from it stays honest.
 */
data class CommitResult(
	/** The decision is committed locally and the delivery obligation is durable. */
	val ok: Boolean,
	/** Revision the commit published, or the unchanged revision of a refusal. */
	val revision: Long,
	/** Exactly the categories this action confirmed. Empty on a refusal. */
	val confirmed: Map<String, Boolean>,
	/**
	 * The payload is persisted and waiting for, or undergoing, delivery. `false` on a
	 * committed save under `NativeConfig.dryRun`, which drops the record.
	 */
	val queued: Boolean,
	/**
	 * The backend accepted this body, and the queue released it, before this call returned.
	 *
	 * A real claim, and a narrow one. The first send is not joined, so the only way it can
	 * be observed from this thread is that the host's [com.inth.core.spi.TaskExecutor] ran
	 * it inline -- which is what [com.inth.core.spi.TaskExecutor.DIRECT] does, and what a
	 * host that already owns a thread does. Behind a pool this is always `false`, and that
	 * is not a failure: the obligation is [queued], and delivery arrives as the queue
	 * drains or as an error event carrying `save-rejected`, `save-undeliverable`, or
	 * `transport-unavailable`.
	 *
	 * Both cores agree that a commit never asserts delivery, and the assertion is never
	 * stronger than this. There is no read of a shared flag here: the answer travels in an
	 * atomic that the sending thread writes before it returns, so an inline executor's
	 * result is visible and a pooled one is simply not there yet.
	 */
	val delivered: Boolean,
	/** Why the save was refused: `queue-write-failed` or `concurrent-change`. */
	val error: KernelError? = null,
)

/** Outcome of [ConsentCore.flushPending]. */
data class FlushResult(
	/** Entries the backend accepted during this flush. */
	val delivered: Int,
	/** Entries still queued afterwards. */
	val remaining: Int,
	/** Set when the backend refused a payload, which a retry will not fix. */
	val error: KernelError? = null,
)

/** Why [ConsentCore.optOut] did not record an opt-out. */
enum class OptOutRefusalReason(val wireName: String) {
	/** The active policy's model is not `opt-out`, or no policy has resolved yet. */
	NOT_AVAILABLE("not-available"),

	/** The durable envelope write failed, so no opt-out was recorded. */
	STORAGE_FAILED("queue-write-failed"),

	/** No core is installed on [Inth]. */
	NOT_BOOTSTRAPPED("not-bootstrapped"),
	;
}

/** Outcome of [ConsentCore.optOut]. */
data class OptOutResult(
	/** `true` when a durable opt-out record is held after this call (newly recorded or already present). */
	val ok: Boolean,
	/** Revision the call published, or the unchanged revision on a no-op or refusal. */
	val revision: Long,
	/** The held opt-out record when [ok], or `null` on a refusal. */
	val optOut: OptOutRecord? = null,
	/** `true` when this call recorded a new opt-out, `false` on a no-op or refusal. */
	val changed: Boolean = false,
	/** Why the command was refused, or `null` when [ok]. */
	val reason: OptOutRefusalReason? = null,
	/** Error detail emitted on a storage or bootstrap refusal, if any. */
	val error: KernelError? = null,
)

/** Why [ConsentCore.optIn] did not lift the opt-out record. */
enum class OptInRefusalReason(val wireName: String) {
	/** No durable opt-out record is held. */
	NOT_OPTED_OUT("not-opted-out"),

	/** Global Privacy Control is active under a policy that maps it. */
	GPC_ACTIVE("gpc-active"),

	/** The opt-out is held by the person's account (`person` or `both`) and cannot be lifted locally. */
	HELD_BY_ACCOUNT("held-by-account"),

	/** The durable envelope write failed, so the opt-out record remains held. */
	STORAGE_FAILED("queue-write-failed"),

	/** No core is installed on [Inth]. */
	NOT_BOOTSTRAPPED("not-bootstrapped"),
	;
}

/** Outcome of [ConsentCore.optIn]. */
data class OptInResult(
	/** `true` when the held durable opt-out record was lifted and persisted. */
	val ok: Boolean,
	/** Revision the call published, or the unchanged revision on a refusal. */
	val revision: Long,
	/** Why the command was refused, or `null` when [ok]. */
	val reason: OptInRefusalReason? = null,
	/** Error detail emitted on a storage or bootstrap refusal, if any. */
	val error: KernelError? = null,
)

/**
 * Handle for a registered observer. It owns the callback.
 *
 * The core holds the callback strongly until [close] runs, for every observer
 * method: `onChange`, `onError`, `gate`, and `gateDecision`. A lambda written
 * inline keeps firing with nothing else referencing it. Dropping the handle
 * without closing it does not stop callbacks, because the JVM gives no prompt
 * signal when an object becomes unreachable; close it where the owner tears down.
 */
fun interface Subscription {
	/** Stop observing. Safe to call more than once. */
	fun close()
}
