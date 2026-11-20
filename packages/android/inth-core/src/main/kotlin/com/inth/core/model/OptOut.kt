package com.inth.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A single opt-out right a durable opt-out record can refuse, in canonical order.
 *
 * Mirrors `OPT_OUT_RIGHTS` in `packages/sdk/schema/src/shared/opt-out.ts`.
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
 * Mirrors `OPT_OUT_METHODS` in `packages/sdk/schema/src/shared/opt-out.ts`.
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
 * Mirrors `OPT_OUT_HOLDERS` in `packages/sdk/schema/src/shared/opt-out.ts`.
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
 * Mirrors `OptOutRecord` in `packages/sdk/schema/src/shared/opt-out.ts`. While held,
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
	}
}
