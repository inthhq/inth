package com.inth.core.transport

import com.inth.core.model.OptOutRecord
import kotlinx.serialization.json.JsonElement

/** Result of a transport call that answers with a document. */
sealed class TransportOutcome {
	/**
	 * A 2xx response. [body] is `null` when it carried no readable JSON.
	 *
	 * [headers] must be keyed by lower-cased header name; [header] enforces the
	 * case-insensitive lookup HTTP requires.
	 */
	data class Success(val body: JsonElement?, val headers: Map<String, String>) : TransportOutcome() {
		/** Case-insensitive header read. */
		fun header(name: String): String? = headers[name.lowercase()]
	}

	/**
	 * A non-2xx response: the backend answered, but not with what was asked for.
	 *
	 * Read from the `/v1` error body `{ "error": { "code", "message" }, "requestId" }`.
	 * [requestId] falls back to the `x-request-id` header and [message] to the raw body
	 * text when the body is not that shape. [message] is `null` for an empty body.
	 */
	data class HttpFailure(
		val status: Int,
		val code: String? = null,
		val requestId: String? = null,
		val message: String? = null,
	) : TransportOutcome() {
		/** `HTTP 409 identity_conflict (request req_1): message`, leaving out what is unknown. */
		fun describe(): String = buildString {
			append("HTTP ").append(status)
			code?.let { append(' ').append(it) }
			requestId?.let { append(" (request ").append(it).append(')') }
			message?.takeIf { it.isNotBlank() }?.let { append(": ").append(it) }
		}
	}

	/** No usable answer: no connectivity, DNS, TLS, or a crashed client. */
	data class NetworkFailure(val message: String) : TransportOutcome()
}

/** Result of delivering a consent write. */
sealed class SaveOutcome {
	/**
	 * The backend accepted the payload.
	 *
	 * [subjectId] is the canonical subject id the response named, or `null` when it named
	 * none. The core adopts it when it is a UUIDv7 that differs from the stored id.
	 * [optOut] is the authoritative opt-out record the response carried, if valid.
	 */
	data class Delivered(
		val subjectId: String? = null,
		val optOut: OptOutRecord? = null,
	) : SaveOutcome()

	/** The backend answered a non-2xx status; the payload stays queued unless it is permanent. */
	data class Rejected(val failure: TransportOutcome.HttpFailure) : SaveOutcome()

	/** Unreachable; the payload stays queued for the next launch or foreground. */
	data class Unavailable(val message: String) : SaveOutcome()

	/**
	 * Whether retrying this exact body can ever change the answer.
	 *
	 * The queue replays frozen bytes, so a refusal that came from reading those bytes says
	 * the same thing on the eleventh try as on the first. `4xx` is that case.
	 *
	 * `408`, `425`, and `429` are excluded because they are about the request's timing,
	 * not its contents: the same body may be accepted a moment later. So are `5xx`, a
	 * timeout, and a dropped socket. `401` and `403` do count as permanent for a body,
	 * which is not the same claim as permanent for a device -- the queue holds bodies and
	 * nothing else, so a credential that comes back later cannot rescue bytes the producer
	 * already refused on its own terms.
	 *
	 * `transport/cases.json` pins the set for this core and the Swift one, so an entry
	 * cannot expire on one platform and queue forever on the other.
	 */
	val isPermanentlyRejected: Boolean
		get() = when (this) {
			is Rejected -> failure.status.let { it in 400..499 && it != 408 && it != 425 && it != 429 }
			is Delivered,
			is Unavailable,
			-> false
		}
}

/** Result of `POST /v1/subjects/{id}/link`. */
sealed class LinkOutcome {
	/**
	 * The backend linked the subject. [subjectId] is the canonical id it named, if any,
	 * and [optOut] is the effective opt-out record it returned, if valid.
	 */
	data class Linked(
		val subjectId: String? = null,
		val optOut: OptOutRecord? = null,
	) : LinkOutcome()

	/** The backend refused the link, for example `identity_token_invalid`. */
	data class Rejected(val failure: TransportOutcome.HttpFailure) : LinkOutcome()

	/** Nothing answered. A link is not queued, so the host calls `identify` again. */
	data class Unavailable(val message: String) : LinkOutcome()
}

/**
 * Result of `POST /v1/consent/opt-outs`.
 *
 * Failure classification mirrors `readOptOutFailure` in `packages/sdk/core`:
 * - `413` and `400` with body code `invalid_request` are permanent refusals (drop entry).
 * - `409` with body code `subject_conflict` triggers subject recovery and a resend.
 * - Policy snapshot codes (`policy_snapshot_*`), `401`, `429`, `5xx`, network failures,
 *   and `404` stay queued for retry. The native core only ever talks to the hosted
 *   backend, so there is no "backend without the route" case to design for; a `404` is
 *   treated as a retryable failure.
 */
sealed class OptOutOutcome {
	/**
	 * The backend recorded the opt-out.
	 *
	 * [optOut] is the authoritative record from the backend, or `null` when the backend
	 * answered `optOut: null` (a retry arriving after a lift) or carried no valid record;
	 * in either case nothing is re-applied locally.
	 */
	data class Delivered(
		val subjectId: String? = null,
		val optOut: OptOutRecord? = null,
	) : OptOutOutcome()

	/** The backend answered a non-2xx status. */
	data class Rejected(val failure: TransportOutcome.HttpFailure) : OptOutOutcome()

	/** Unreachable or unusable response; the act stays queued for retry. */
	data class Unavailable(val message: String) : OptOutOutcome()

	/** `409 subject_conflict`: move the visitor to a new subject ID and resend. */
	val isSubjectConflict: Boolean
		get() = this is Rejected && isOptOutSubjectConflict(failure)

	/** `409 policy_snapshot_*`: drop the expired policy snapshot token and resend. */
	val isPolicySnapshotConflict: Boolean
		get() = this is Rejected && isOptOutPolicySnapshotConflict(failure)

	/**
	 * Refused for good (`413` or `400 invalid_request`): remove from queue.
	 *
	 * Policy snapshot codes and `404` are never permanent here: the native core only ever
	 * talks to the hosted backend, so `404` stays retryable rather than disabling opt-outs.
	 */
	val isPermanentlyRejected: Boolean
		get() = this is Rejected && isOptOutPermanentRejection(failure)
}

/**
 * Result of `POST /v1/consent/opt-outs/lift`.
 *
 * Uses the same failure classification as [OptOutOutcome]: `413` and `400 invalid_request`
 * are permanent, `409 subject_conflict` recovers with a new subject ID, and everything
 * else (including policy snapshot codes and `404`, since the native core only talks to the
 * hosted backend) is retryable.
 */
sealed class LiftOptOutOutcome {
	/**
	 * The backend recorded the lift.
	 *
	 * [cleared] is `true` only when the response explicitly carried `optOut: null` (no
	 * opt-out remains in force). When [optOut] is non-null, that record still stands (for
	 * example an account-held opt-out when only the device's lifted). When both [cleared]
	 * is `false` and [optOut] is `null`, the response carried no usable opt-out
	 * information and nothing is cleared or replaced.
	 */
	data class Delivered(
		val subjectId: String? = null,
		val optOut: OptOutRecord? = null,
		val cleared: Boolean = optOut == null,
	) : LiftOptOutOutcome() {
		init {
			require(!(cleared && optOut != null)) {
				"LiftOptOutOutcome.Delivered cannot be both cleared and carry an optOut"
			}
		}
	}

	/** The backend answered a non-2xx status. */
	data class Rejected(val failure: TransportOutcome.HttpFailure) : LiftOptOutOutcome()

	/** Unreachable or unusable response; a device lift stays queued, an account lift fails. */
	data class Unavailable(val message: String) : LiftOptOutOutcome()

	/** `409 subject_conflict`: move the visitor to a new subject ID and resend. */
	val isSubjectConflict: Boolean
		get() = this is Rejected && isOptOutSubjectConflict(failure)

	/** `409 policy_snapshot_*`: drop the expired policy snapshot token and resend. */
	val isPolicySnapshotConflict: Boolean
		get() = this is Rejected && isOptOutPolicySnapshotConflict(failure)

	/**
	 * Refused for good (`413` or `400 invalid_request`): remove from queue.
	 *
	 * Policy snapshot codes and `404` stay retryable (the native core only talks to the
	 * hosted backend).
	 */
	val isPermanentlyRejected: Boolean
		get() = this is Rejected && isOptOutPermanentRejection(failure)
}

internal fun isOptOutSubjectConflict(failure: TransportOutcome.HttpFailure): Boolean =
	failure.status == 409 && failure.code == "subject_conflict"

internal fun isOptOutPolicySnapshotConflict(failure: TransportOutcome.HttpFailure): Boolean =
	failure.status == 409 && failure.code?.startsWith("policy_snapshot_") == true

internal fun isOptOutPermanentRejection(failure: TransportOutcome.HttpFailure): Boolean =
	failure.status == 413 || (failure.status == 400 && failure.code == "invalid_request")
