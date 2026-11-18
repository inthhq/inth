package com.inth.core.transport

import com.inth.core.InthInternalApi
import com.inth.core.model.KernelOverrides
import com.inth.core.model.KernelUser
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelError
import com.inth.core.model.PolicyResolution
import com.inth.core.model.QueuedSave
import com.inth.core.model.SavePayload

/** Context the core passes to `init`. */
data class InitContext(
	val overrides: KernelOverrides,
	val subject: ConsentSubject?,
	/** `true` when the device reports GPC or the developer forced it on. */
	val gpc: Boolean,
	/**
	 * The vendor scope `NativeConfig.vendors` declares, passed through unchanged.
	 *
	 * The core hands its declaration down rather than letting the transport read it off
	 * the [com.inth.core.NativeConfig] it is already handed, so that both cores put the
	 * scope on the wire through one shape -- `core-swift`'s transport is constructed
	 * without any consent configuration at all, and a Kotlin transport that kept its own
	 * copy of one fact the kernel also holds is a second answer waiting to drift. It also
	 * means a test that drives a transport directly, or a host that swaps one in, still
	 * sees the declaration travel with the request it is supposed to shape.
	 */
	val vendors: List<Int>? = null,
)

/**
 * The three commands the core delegates, one per `/v1` route.
 *
 * Implementations must be thread safe. They must not throw for a non-2xx status:
 * report it as [TransportOutcome.HttpFailure] and let the core decide. The core
 * treats a thrown exception as a connectivity failure and keeps the previous
 * state, which is what makes a retry meaningful.
 *
 * Internal: apps do not supply a transport. Tests and first-party fixtures do.
 */
@InthInternalApi
interface InthTransport {
	/** `GET /v1/consent/init`: policy, location, translations and the vendor list. */
	fun init(context: InitContext): TransportOutcome

	/**
	 * `POST /v1/consent/records`: deliver one queued consent write. [QueuedSave.body] must
	 * be sent byte for byte. A `200` answers [SaveOutcome.Delivered] with the canonical
	 * subject id the response named.
	 */
	fun save(entry: QueuedSave): SaveOutcome

	/**
	 * `POST /v1/subjects/{id}/link`: link [subject] to [user], proven by [identityToken].
	 *
	 * The token is used for this one request and never stored. A `200` answers
	 * [LinkOutcome.Linked] with the canonical subject id the response named.
	 */
	fun link(
		subject: ConsentSubject,
		user: KernelUser,
		identityToken: String,
	): LinkOutcome

	companion object {
		/**
		 * A transport that answers nothing. Commands become local-only, which is the
		 * fail-closed path a test drives.
		 */
		val NONE: InthTransport = object : InthTransport {
			override fun init(context: InitContext): TransportOutcome = TransportOutcome.NetworkFailure("no transport configured")

			override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable("no transport configured")

			override fun link(
				subject: ConsentSubject,
				user: KernelUser,
				identityToken: String,
			): LinkOutcome = LinkOutcome.Unavailable("no transport configured")
		}
	}
}

/** A transport failure the core surfaces to the host. */
fun transportError(
	reason: String,
	detail: String?,
): KernelError = KernelError(
	code = reason,
	message = detail ?: "Inth transport: $reason",
)

/** Whether a save outcome means "remove from the queue". */
val SaveOutcome.delivered: Boolean
	get() = this is SaveOutcome.Delivered

/** The resolution reason a failed init should record, or `null` on success. */
fun TransportOutcome.failureReason(): String? = when (this) {
	is TransportOutcome.HttpFailure -> PolicyResolution.REASON_TRANSPORT
	is TransportOutcome.NetworkFailure -> PolicyResolution.REASON_TRANSPORT
	is TransportOutcome.Success -> null
}
