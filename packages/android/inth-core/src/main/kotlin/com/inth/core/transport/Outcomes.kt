package com.inth.core.transport

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
	 * text when the body is not that shape.
	 */
	data class HttpFailure(
		val status: Int,
		val code: String? = null,
		val requestId: String? = null,
		val message: String = "HTTP $status",
	) : TransportOutcome() {
		/** The status, code and request id in one line, for an error event. */
		fun describe(): String = describeHttpFailure(status, code, requestId, message)
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
	 */
	data class Delivered(val subjectId: String? = null) : SaveOutcome()

	/** The backend answered a non-2xx status; the payload stays queued unless it is permanent. */
	data class Rejected(
		val status: Int,
		val code: String? = null,
		val requestId: String? = null,
		val message: String = "HTTP $status",
	) : SaveOutcome() {
		/** The status, code and request id in one line, for an error event. */
		fun describe(): String = describeHttpFailure(status, code, requestId, message)
	}

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
	 * The Swift core's `InthError.isPermanentlyRejected` answers the same question over a
	 * different type, and the two sets have to stay the same set: an entry must not expire
	 * on one platform and queue forever on the other.
	 */
	val isPermanentlyRejected: Boolean
		get() = when (this) {
			is Rejected -> status in 400..499 && status != 408 && status != 425 && status != 429
			is Delivered,
			is Unavailable,
			-> false
		}
}

/** Result of `POST /v1/subjects/{id}/link`. */
sealed class LinkOutcome {
	/** The backend linked the subject. [subjectId] is the canonical id it named, if any. */
	data class Linked(val subjectId: String? = null) : LinkOutcome()

	/** The backend refused the link, for example `identity_token_invalid`. */
	data class Rejected(val failure: TransportOutcome.HttpFailure) : LinkOutcome()

	/** Nothing answered. A link is not queued, so the host calls `identify` again. */
	data class Unavailable(val message: String) : LinkOutcome()
}

/** `HTTP 409 identity_conflict (request req_1): message`, leaving out what is unknown. */
internal fun describeHttpFailure(status: Int, code: String?, requestId: String?, message: String): String =
	buildString {
		append("HTTP ").append(status)
		code?.let { append(' ').append(it) }
		requestId?.let { append(" (request ").append(it).append(')') }
		if (message.isNotBlank() && message != "HTTP $status") append(": ").append(message)
	}
