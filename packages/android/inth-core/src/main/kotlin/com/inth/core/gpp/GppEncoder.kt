package com.inth.core.gpp

/**
 * GPP string encoding: the header, Fibonacci ranges, compressed base64url and the
 * fixed-width US National section.
 *
 * A port of `packages/sdk/iab/src/gpp/encoder.ts`, so a device and a web page given the
 * same inputs write the same bytes. `packages/native-protocol/gpp/cases.json` holds the
 * strings both cores and the web encoder must produce, and the `@c15t/iab` test
 * `native-gpp-fixtures.test.ts` decodes every one with the IAB reference library.
 *
 * `core-swift`'s `GPPEncoder.swift` mirrors this file function for function.
 */
object GppEncoder {
	/** Section ID of the GPP header. */
	const val HEADER_ID: Int = 3

	/** Version of the GPP header. */
	const val HEADER_VERSION: Int = 1

	private const val BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

	/** Fibonacci terms past this many cannot code any section ID or offset. */
	private const val MAX_FIBONACCI_TERMS = 40

	/** Appends [value] as a big-endian bit string [bits] wide. */
	internal fun fixedInteger(value: Int, bits: Int, into: StringBuilder) {
		require(bits in 1..30 && value >= 0 && value < (1 shl bits)) {
			"GPP: $value does not fit in $bits bits."
		}
		for (shift in bits - 1 downTo 0) {
			into.append(if ((value shr shift) and 1 == 1) '1' else '0')
		}
	}

	/** Appends the Fibonacci code of a positive integer, which ends in `11`. */
	internal fun fibonacciInteger(value: Int, into: StringBuilder) {
		require(value >= 1) { "GPP: a Fibonacci integer must be positive, got $value." }
		val sequence = mutableListOf(1, 2)
		while (sequence[sequence.size - 1] + sequence[sequence.size - 2] <= value &&
			sequence.size < MAX_FIBONACCI_TERMS
		) {
			sequence += sequence[sequence.size - 1] + sequence[sequence.size - 2]
		}
		var remaining = value
		val digits = CharArray(sequence.size) { '0' }
		for (index in sequence.indices.reversed()) {
			if (sequence[index] <= remaining) {
				digits[index] = '1'
				remaining -= sequence[index]
			}
		}
		var end = digits.size
		while (end > 0 && digits[end - 1] == '0') end -= 1
		into.append(digits, 0, end).append('1')
	}

	/**
	 * Appends sorted, distinct integers as a Fibonacci-coded range: a 12-bit group
	 * count, then each run as an offset from the end of the previous one.
	 */
	internal fun fibonacciRange(values: Collection<Int>, into: StringBuilder) {
		val groups = mutableListOf<IntRange>()
		for (value in values.toSortedSet()) {
			val last = groups.lastOrNull()
			if (last != null && last.last == value - 1) {
				groups[groups.size - 1] = last.first..value
			} else {
				groups += value..value
			}
		}
		fixedInteger(groups.size, 12, into)
		var offset = 0
		for (group in groups) {
			if (group.first == group.last) {
				into.append('0')
				fibonacciInteger(group.first - offset, into)
			} else {
				into.append('1')
				fibonacciInteger(group.first - offset, into)
				fibonacciInteger(group.last - group.first, into)
			}
			offset = group.last
		}
	}

	/**
	 * Base64url without padding characters. The bit string is padded with zeros to a
	 * whole byte, then to a whole character, as GPP's compressed encoding requires.
	 */
	internal fun compressedBase64Url(bits: CharSequence): String {
		val byteBits = (bits.length + 7) / 8 * 8
		val total = (byteBits + 5) / 6 * 6
		val out = StringBuilder(total / 6)
		var index = 0
		while (index < total) {
			var sextet = 0
			for (offset in 0 until 6) {
				val position = index + offset
				val bit = if (position < bits.length && bits[position] == '1') 1 else 0
				sextet = (sextet shl 1) or bit
			}
			out.append(BASE64_URL[sextet])
			index += 6
		}
		return out.toString()
	}

	/** Encodes one subsection from its field table. Absent fields encode as `0`. */
	internal fun encodeSubsection(fields: List<GppField>, values: Map<String, List<Int>>): String {
		val bits = StringBuilder()
		for (field in fields) {
			val value = values[field.name]
			val count = field.count
			if (count == null) {
				fixedInteger(value?.singleOrNull() ?: 0, field.bits, bits)
			} else {
				val entries = value ?: List(count) { 0 }
				require(entries.size == count) { "GPP: ${field.name} needs $count entries." }
				for (entry in entries) fixedInteger(entry, field.bits, bits)
			}
		}
		return compressedBase64Url(bits)
	}

	/**
	 * Encodes the US National section: the core subsection, then the GPC subsection.
	 *
	 * @param core field values by specification name; a scalar is a one-entry list.
	 * @param gpc the Global Privacy Control flag.
	 * @throws IllegalArgumentException when a value does not fit its field.
	 */
	fun encodeUsNational(core: Map<String, List<Int>>, gpc: Boolean): String {
		val gpcBits = StringBuilder()
		fixedInteger(GppUsNational.GPC_SUBSECTION_TYPE, 2, gpcBits)
		gpcBits.append(if (gpc) '1' else '0')
		return encodeSubsection(GppUsNational.CORE, core) + "." + compressedBase64Url(gpcBits)
	}

	/**
	 * Joins sections into a GPP string behind a header listing their IDs, in
	 * ascending ID order.
	 *
	 * @return the GPP string, or `null` when there is no section.
	 */
	fun encodeGppString(sections: List<GppSection>): String? {
		if (sections.isEmpty()) return null
		val ordered = sections.sortedBy { it.id }
		val header = StringBuilder()
		fixedInteger(HEADER_ID, 6, header)
		fixedInteger(HEADER_VERSION, 6, header)
		fibonacciRange(ordered.map { it.id }, header)
		return (listOf(compressedBase64Url(header)) + ordered.map { it.encoded }).joinToString("~")
	}
}

/** One field of a GPP subsection: its specification name, width, and list length. */
class GppField(val name: String, val bits: Int, val count: Int? = null)

/** One encoded section of a GPP string. */
data class GppSection(val id: Int, val encoded: String)

/**
 * The MSPA US National section, version 2: `US_NATIONAL_SECTION` in
 * `packages/sdk/iab/src/gpp/sections.ts`.
 *
 * Version 3 (November 2026) replaced every field. No IAB reference decoder reads it
 * yet, and web Inth encodes version 2, so this build does too. See `packages/native-protocol/CONTRACT.md`.
 */
object GppUsNational {
	const val ID: Int = 7
	const val VERSION: Int = 2
	const val PREFIX: String = "usnat"
	internal const val GPC_SUBSECTION_TYPE = 1

	private fun int(name: String) = GppField(name, 2)

	/** Core subsection fields, in encoding order. */
	val CORE: List<GppField> = listOf(
		GppField("Version", 6),
		int("SharingNotice"),
		int("SaleOptOutNotice"),
		int("SharingOptOutNotice"),
		int("TargetedAdvertisingOptOutNotice"),
		int("SensitiveDataProcessingOptOutNotice"),
		int("SensitiveDataLimitUseNotice"),
		int("SaleOptOut"),
		int("SharingOptOut"),
		int("TargetedAdvertisingOptOut"),
		GppField("SensitiveDataProcessing", 2, 16),
		GppField("KnownChildSensitiveDataConsents", 2, 3),
		int("PersonalDataConsents"),
		int("MspaCoveredTransaction"),
		int("MspaOptOutOptionMode"),
		int("MspaServiceProviderMode"),
	)
}

/** Section ID of IAB TCF EU v2 inside a GPP string. */
const val GPP_TCF_EU_SECTION_ID: Int = 2
