package com.inth.core

import com.inth.core.spi.Clock
import java.security.SecureRandom

/**
 * Supplies the random half of a generated id.
 *
 * The seam exists so a test can pin an id instead of drawing a real one; production
 * always uses [SECURE]. A source that repeats bytes repeats identities, so there is
 * deliberately no deterministic default.
 */
fun interface SubjectEntropy {
	/** Return [count] fresh random bytes. */
	fun nextBytes(count: Int): ByteArray

	companion object {
		/**
		 * One [SecureRandom] for the process, drawn per id. It is thread safe, and
		 * reusing it keeps each draw cheap instead of reseeding on every subject.
		 */
		val SECURE = SubjectEntropy { count ->
			ByteArray(count).also { secureRandom.nextBytes(it) }
		}

		private val secureRandom = SecureRandom()
	}
}

/**
 * Generates the Inth subject id: a UUIDv7 in lowercase canonical text.
 *
 * Every `/v1` route takes this form. The layout is pinned by
 * `packages/native-protocol/subject-id/uuidv7.json`, and the Swift core mints the same
 * vectors:
 *
 * - bytes 0 to 5: milliseconds since the Unix epoch, big-endian, clamped to
 *   `[0, 2^48 - 1]` so a device with a wrong clock still writes an id the backend accepts;
 * - byte 6: `0x70 | (random[0] & 0x0f)`, byte 7: `random[1]`;
 * - byte 8: `0x80 | (random[2] & 0x3f)`, bytes 9 to 15: `random[3..9]`.
 *
 * The random half is the only part that carries entropy, and it is never a hardware
 * identifier. The same generator makes each save's idempotency key.
 */
class SubjectIdGenerator(
	private val clock: Clock = Clock.SYSTEM,
	private val entropy: SubjectEntropy = SubjectEntropy.SECURE,
) {
	/**
	 * Mint one id.
	 *
	 * @throws IllegalArgumentException if [entropy] returns bytes other than [RANDOM_BYTES].
	 */
	fun generate(): String {
		val random = entropy.nextBytes(RANDOM_BYTES)
		// Shorter would silently leave zero bytes where entropy belongs, which reads
		// as a valid id while weakening it.
		require(random.size == RANDOM_BYTES) {
			"Inth: subject entropy must return $RANDOM_BYTES bytes, got ${random.size}"
		}
		val millis = clock.nowMillis().coerceIn(0L, MAX_MILLIS)
		val bytes = ByteArray(16)
		for (index in 0 until 6) {
			bytes[index] = (millis ushr ((5 - index) * 8)).toByte()
		}
		bytes[6] = (0x70 or (random[0].toInt() and 0x0f)).toByte()
		bytes[7] = random[1]
		bytes[8] = (0x80 or (random[2].toInt() and 0x3f)).toByte()
		random.copyInto(bytes, destinationOffset = 9, startIndex = 3)
		return format(bytes)
	}

	companion object {
		/**
		 * Mint one id from the wall clock and [SubjectEntropy.SECURE]. The production
		 * form; inject a [Clock] and a [SubjectEntropy] to pin one instead.
		 */
		fun generate(): String = default.generate()

		/**
		 * Whether [candidate] is a stored subject id this build adopts: a UUIDv7
		 * ([isUuidV7]) or a c15t id ([isC15tId]). Anything else is `subject-id-unusable`.
		 * These are the `read` cases in `uuidv7.json`.
		 */
		fun isValid(candidate: String): Boolean = isUuidV7(candidate) || isC15tId(candidate)

		/**
		 * Whether [candidate] is a lowercase canonical UUIDv7 with the RFC 4122 variant.
		 * The nil and max UUIDs fail the version check, so they are never accepted.
		 */
		fun isUuidV7(candidate: String): Boolean {
			if (!isLowercaseUuid(candidate)) {
				return false
			}
			return candidate[UUID_VERSION_INDEX] == '7' && candidate[UUID_VARIANT_INDEX] in "89ab"
		}

		/**
		 * Whether [candidate] is a c15t subject id: `sub_` followed by base58 text,
		 * `^sub_[1-9A-HJ-NP-Za-km-z]+$`. A `/v1` route takes it and answers with the
		 * canonical UUIDv7, which the core then adopts.
		 */
		fun isC15tId(candidate: String): Boolean {
			if (!candidate.startsWith(C15T_PREFIX) || candidate.length == C15T_PREFIX.length) {
				return false
			}
			return candidate.substring(C15T_PREFIX.length).all { it in BASE58_ALPHABET }
		}

		/**
		 * Whether [candidate] is the lowercase UUID v4 shape an early prerelease of this SDK
		 * minted.
		 *
		 * Diagnosis only: it lets the `subject-id-unusable` message say which build wrote
		 * the id. It is never a reason to adopt one.
		 */
		fun isLegacyUuidShape(candidate: String): Boolean =
			isLowercaseUuid(candidate) &&
				candidate[UUID_VERSION_INDEX] == '4' && candidate[UUID_VARIANT_INDEX] in "89ab"

		private fun isLowercaseUuid(candidate: String): Boolean {
			if (candidate.length != UUID_LENGTH) {
				return false
			}
			for (index in 0 until UUID_LENGTH) {
				val char = candidate[index]
				if (index in UUID_HYPHENS) {
					if (char != '-') {
						return false
					}
				} else if (!char.isDigit() && char !in 'a'..'f') {
					return false
				}
			}
			return true
		}

		private fun format(bytes: ByteArray): String {
			val hex = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
			return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-" +
				"${hex.substring(16, 20)}-${hex.substring(20)}"
		}

		private val default = SubjectIdGenerator()

		private const val RANDOM_BYTES = 10
		private const val MAX_MILLIS = (1L shl 48) - 1

		private const val C15T_PREFIX = "sub_"

		private const val UUID_LENGTH = 36
		private val UUID_HYPHENS = setOf(8, 13, 18, 23)
		private const val UUID_VERSION_INDEX = 14
		private const val UUID_VARIANT_INDEX = 19

		/** Bitcoin's alphabet, the one c15t ids use: no `0`, `O`, `I`, or `l`. */
		private const val BASE58_ALPHABET =
			"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	}
}
