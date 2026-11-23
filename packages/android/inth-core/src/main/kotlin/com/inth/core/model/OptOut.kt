package com.inth.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/**
 * A single opt-out right a durable opt-out record can refuse, in canonical order.
 *
 * Mirrors `OPT_OUT_RIGHTS` in `packages/sdk/schema/src/shared/opt-out.model.ts`.
 */
@Serializable
enum class OptOutRight(val wireName: String) {
	@SerialName("sale")
	SALE("sale"),

	@SerialName("share")
	SHARE("share"),

	@SerialName("targeted_ads")
	TARGETED_ADS("targeted_ads"),
	;

	companion object {
		/** Parse a wire value, returning `null` for unknown values. */
		fun fromWireName(value: String?): OptOutRight? = entries.firstOrNull { it.wireName == value }
	}
}

/**
 * How a durable opt-out record was created.
 *
 * Mirrors `OPT_OUT_METHODS` in `packages/sdk/schema/src/shared/opt-out.model.ts`.
 */
@Serializable
enum class OptOutMethod(val wireName: String) {
	@SerialName("button")
	BUTTON("button"),

	@SerialName("gpc")
	GPC("gpc"),

	@SerialName("api")
	API("api"),

	@SerialName("propagated")
	PROPAGATED("propagated"),
	;

	companion object {
		/** Parse a wire value, returning `null` for unknown values. */
		fun fromWireName(value: String?): OptOutMethod? = entries.firstOrNull { it.wireName == value }
	}
}

/**
 * Who holds a durable opt-out record.
 *
 * Mirrors `OPT_OUT_HOLDERS` in `packages/sdk/schema/src/shared/opt-out.model.ts`.
 */
@Serializable
enum class OptOutHolder(val wireName: String) {
	@SerialName("device")
	DEVICE("device"),

	@SerialName("person")
	PERSON("person"),

	@SerialName("both")
	BOTH("both"),
	;

	companion object {
		/** Parse a wire value, returning `null` for unknown values. */
		fun fromWireName(value: String?): OptOutHolder? = entries.firstOrNull { it.wireName == value }
	}
}

/**
 * Durable opt-out record, separate from per-category [ExplicitChoice] receipts.
 *
 * Mirrors `OptOutRecord` in `packages/sdk/schema/src/shared/opt-out.model.ts`. While held,
 * `marketing` and `measurement` in the matched rule's scope carry the `opt-out`
 * restriction regardless of model, expiry or policy fingerprint changes.
 *
 * [recordedAt] is an epoch-millisecond timestamp and is never rejected for being in
 * the future so a slow device clock does not drop a backend-stamped record. [rights]
 * may be empty on a device-created record until the backend answers with the rights
 * for the subject's location.
 */
@Serializable
data class OptOutRecord(
	val rights: List<OptOutRight>,
	val method: OptOutMethod,
	val recordedAt: Long,
	val heldBy: OptOutHolder,
) {
	init {
		require(recordedAt in 0L..MAX_DATE_MS) {
			"OptOutRecord.recordedAt must be a non-negative epoch millisecond timestamp"
		}
		require(rights.size == rights.toSet().size) {
			"OptOutRecord.rights must not contain duplicates"
		}
	}

	companion object {
		/** Largest epoch millisecond value the JS `Date` and kernel validator accept. */
		const val MAX_DATE_MS: Long = 8_640_000_000_000_000L

		private val WIRE_KEYS = setOf("rights", "method", "recordedAt", "heldBy")

		/**
		 * Parse an authoritative `EffectiveOptOut` from a backend `/v1` response.
		 *
		 * Mirrors `readOptOut` + `validateOptOutRecord` in `packages/sdk/core`: rejects
		 * unknown keys, unknown enum values, duplicate rights, invalid timestamps and an
		 * empty `rights` list (the backend always names the applicable rights). Returns
		 * `null` for absent, `null`, or invalid values ("no information"), and normalizes
		 * `rights` into canonical order (`sale`, `share`, `targeted_ads`).
		 */
		fun fromWire(element: JsonElement?): OptOutRecord? {
			val obj = element as? JsonObject ?: return null
			if (obj.keys.any { it !in WIRE_KEYS }) return null

			val rawRights = obj["rights"] as? JsonArray ?: return null
			if (rawRights.isEmpty()) return null
			val seen = LinkedHashSet<OptOutRight>(rawRights.size)
			for (entry in rawRights) {
				val prim = entry as? JsonPrimitive ?: return null
				if (!prim.isString) return null
				val right = OptOutRight.fromWireName(prim.contentOrNull) ?: return null
				if (!seen.add(right)) return null
			}
			val canonicalRights = OptOutRight.entries.filter { it in seen }

			val methodPrim = obj["method"] as? JsonPrimitive ?: return null
			if (!methodPrim.isString) return null
			val method = OptOutMethod.fromWireName(methodPrim.contentOrNull) ?: return null

			val heldByPrim = obj["heldBy"] as? JsonPrimitive ?: return null
			if (!heldByPrim.isString) return null
			val heldBy = OptOutHolder.fromWireName(heldByPrim.contentOrNull) ?: return null

			val recordedAtPrim = obj["recordedAt"] as? JsonPrimitive ?: return null
			if (recordedAtPrim.isString) return null
			val recordedAt = recordedAtPrim.longOrNull ?: return null
			if (recordedAt !in 0L..MAX_DATE_MS) return null

			return OptOutRecord(
				rights = canonicalRights,
				method = method,
				recordedAt = recordedAt,
				heldBy = heldBy,
			)
		}
	}
}

/**
 * Payload for `POST /v1/consent/opt-outs`, built once per local opt-out act.
 *
 * Mirrors `OptOutPayload` in `packages/sdk/core/src/consent-kernel.model.ts`. Never carries `rights`
 * (the backend derives applicable rights from the visitor's location) and never stores
 * an identity token.
 */
@Serializable
data class OptOutPayload(
	val subjectId: String,
	val idempotencyKey: String,
	val method: OptOutMethod,
	val givenAt: Long,
	val user: KernelUser? = null,
	val uiSource: ActiveUI? = null,
	val policyId: String? = null,
	val country: String? = null,
	val region: String? = null,
	val language: String? = null,
	val policySnapshotToken: String? = null,
) {
	init {
		require(idempotencyKey.isNotEmpty()) {
			"OptOutPayload.idempotencyKey must not be empty"
		}
		require(method == OptOutMethod.BUTTON || method == OptOutMethod.GPC) {
			"OptOutPayload.method must be button or gpc, got $method"
		}
	}
}

/**
 * Payload for `POST /v1/consent/opt-outs/lift`, built once per opt-out lift.
 *
 * Mirrors `LiftOptOutPayload` in `packages/sdk/core/src/consent-kernel.model.ts`. Never carries `rights`
 * and never stores an identity token.
 */
@Serializable
data class LiftOptOutPayload(
	val subjectId: String,
	val idempotencyKey: String,
	val givenAt: Long,
	val user: KernelUser? = null,
	val uiSource: ActiveUI? = null,
	val policySnapshotToken: String? = null,
) {
	init {
		require(idempotencyKey.isNotEmpty()) {
			"LiftOptOutPayload.idempotencyKey must not be empty"
		}
	}
}

/** Whether a queued opt-out act records an opt-out or lifts one. */
@Serializable
enum class OptOutActKind(val wireName: String) {
	@SerialName("record")
	RECORD("record"),

	@SerialName("lift")
	LIFT("lift"),
}

/**
 * One entry in the offline opt-out queue.
 *
 * Stored without any identity token, replayed in enqueue order with the same
 * [idempotencyKey], and never dropped because the policy or policy snapshot changed.
 */
@Serializable
data class QueuedOptOut(
	val id: String,
	val queuedAt: Long,
	val kind: OptOutActKind,
	val idempotencyKey: String,
	val recordPayload: OptOutPayload? = null,
	val liftPayload: LiftOptOutPayload? = null,
	val attempts: Int = 0,
) {
	init {
		when (kind) {
			OptOutActKind.RECORD -> {
				val payload = requireNotNull(recordPayload) {
					"QueuedOptOut(record) requires recordPayload"
				}
				require(payload.idempotencyKey == idempotencyKey) {
					"QueuedOptOut.idempotencyKey must match recordPayload.idempotencyKey"
				}
			}

			OptOutActKind.LIFT -> {
				val payload = requireNotNull(liftPayload) {
					"QueuedOptOut(lift) requires liftPayload"
				}
				require(payload.idempotencyKey == idempotencyKey) {
					"QueuedOptOut.idempotencyKey must match liftPayload.idempotencyKey"
				}
			}
		}
	}

	val subjectId: String
		get() = when (kind) {
			OptOutActKind.RECORD -> recordPayload!!.subjectId
			OptOutActKind.LIFT -> liftPayload!!.subjectId
		}

	val user: KernelUser?
		get() = when (kind) {
			OptOutActKind.RECORD -> recordPayload!!.user
			OptOutActKind.LIFT -> liftPayload!!.user
		}

	val policySnapshotToken: String?
		get() = when (kind) {
			OptOutActKind.RECORD -> recordPayload!!.policySnapshotToken
			OptOutActKind.LIFT -> liftPayload!!.policySnapshotToken
		}

	/** Copy this queued act under [newSubjectId], keeping its [idempotencyKey] unchanged. */
	fun withSubjectId(newSubjectId: String): QueuedOptOut = when (kind) {
		OptOutActKind.RECORD -> copy(recordPayload = recordPayload!!.copy(subjectId = newSubjectId))
		OptOutActKind.LIFT -> copy(liftPayload = liftPayload!!.copy(subjectId = newSubjectId))
	}

	/** Copy this queued act without its expired [policySnapshotToken], keeping its [idempotencyKey] unchanged. */
	fun withoutPolicySnapshotToken(): QueuedOptOut = when (kind) {
		OptOutActKind.RECORD -> copy(recordPayload = recordPayload!!.copy(policySnapshotToken = null))
		OptOutActKind.LIFT -> copy(liftPayload = liftPayload!!.copy(policySnapshotToken = null))
	}
}
