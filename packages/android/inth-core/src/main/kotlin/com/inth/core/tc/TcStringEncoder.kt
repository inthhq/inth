package com.inth.core.tc

/**
 * The consent facts this build is willing to author a TC String from.
 *
 * The native IAB authority validates complete choices against a disclosed GVL, including publisher
 * restrictions and custom publisher purposes. Low-level callers can still author the original
 * web-compatible subset using the defaults below. PurposeOneTreatment remains false in this
 * authoring profile.
 *
 * [consentScreen] and [publisherCountryCode] default to what the web codec defaults to, because
 * both land in the bytes. A mobile default that disagrees with web's is a parity failure neither
 * side's tests would explain.
 *
 * ConsentLanguage has no knob here, and that is deliberate. The web codec does offer
 * `config.consentLanguage ?? 'EN'`, and the reference then throws that value away:
 * `SemanticPreEncoder` writes `gvl.language` over the model's language on every encode. A default
 * that can never reach the bytes is not a default, it is a setting that silently stops working, so
 * the language lives in one place -- [TcVendorList.language], whose own EN default is the same one
 * `GVL.DEFAULT_LANGUAGE` carries.
 *
 * [vendorList] carries the two version numbers this string writes, and it is required. Neither is
 * optional in the reference either: its encoder throws `Unable to encode TCModel without a GVL`, and
 * a required parameter turns that into a compile error rather than a failure at the moment a string
 * is written. The list is required for a second and heavier reason -- it decides which bits survive
 * at all. Without it there is no way to know whether vendor 400 is a vendor, and the only choices
 * left to the encoder are writing a signal the framework calls invalid and dropping one that was
 * valid. See [TcSemanticPreEncoder].
 *
 * @property confirmedAtMillis When the user decided, in epoch milliseconds. Both date fields in the
 * string are this floored to a UTC day, which is what the format carries. There is no separate
 * creation time: TCF requires Created and LastUpdated to hold the same value, and `tc-string.ts`
 * sets both to the confirmation day.
 */
data class TcConsentInput(
	val cmpId: Int,
	val confirmedAtMillis: Long,
	val vendorList: TcVendorList,
	val cmpVersion: Int = 0,
	val publisherRestrictions: TcPublisherRestrictions = TcPublisherRestrictions.EMPTY,
	val publisher: TcPublisherSegment =
		TcPublisherSegment(emptyList(), emptyList(), 0, emptyList(), emptyList()),
	val consentScreen: Int = DEFAULT_CONSENT_SCREEN,
	val publisherCountryCode: String = DEFAULT_PUBLISHER_COUNTRY_CODE,
	val isServiceSpecific: Boolean = DEFAULT_IS_SERVICE_SPECIFIC,
	val purposeConsents: List<Int> = emptyList(),
	val purposeLegitimateInterests: List<Int> = emptyList(),
	val specialFeatureOptins: List<Int> = emptyList(),
	val vendorConsents: List<Int> = emptyList(),
	val vendorLegitimateInterests: List<Int> = emptyList(),
	val vendorsDisclosed: List<Int> = emptyList(),
) {
	companion object {
		/** `config.consentScreen ?? 1` in `tc-string.ts`. */
		const val DEFAULT_CONSENT_SCREEN = 1

		/** `config.publisherCountryCode ?? 'US'`. */
		const val DEFAULT_PUBLISHER_COUNTRY_CODE = "US"

		/** `config.isServiceSpecific ?? true`. */
		const val DEFAULT_IS_SERVICE_SPECIFIC = true

		/** One UTC day, the granularity the two date fields carry. */
		const val MILLIS_PER_DAY = 86_400_000L

		/** One decisecond, the unit the date fields are stored in. */
		const val MILLIS_PER_DECISSECOND = 100L
	}
}

/**
 * Writes TC Strings.
 *
 * Two entry points, because authoring and re-emitting are different jobs and sharing code between
 * them is how a reader ends up rewriting what it read.
 *
 * [encode] over a [TcConsentInput] authors a string from this build's own consent state and matches
 * what Inth's web codec writes for the same state: same fields, same defaults, same smaller-of-two
 * choice for the vendor sections, same segment sequence.
 *
 * [encode] over a [TcString] re-emits something that was decoded, and it is byte-exact by
 * construction rather than by luck: every vendor section carries the payload bits it was read with,
 * so the absence of a canonical form for range encoding never comes up. It refuses rather than
 * drops -- see [TcCoreSegment.fieldBlockingEncode].
 */
object TcStringEncoder {
	/**
	 * Author a TC String for [input].
	 *
	 * The segment sequence follows `SegmentSequence.js` for the two scopes Inth can produce:
	 * service-specific is `[core].[vendorsDisclosed].[publisherTC]` and global is
	 * `[core].[vendorsDisclosed]`, the Publisher TC segment riding along only in the former. It is
	 * written all-zero because the web codec reaches it with no publisher purpose and no custom
	 * purposes set; skipping the segment there would be a different string, not a shorter one.
	 *
	 * The bytes describe [TcSemanticPreEncoder.prepare]'s reading of [input], not [input] verbatim.
	 * Three signals are cleared and one is replaced before a bit is written, and all four decisions
	 * are the reference's, so a string this writes for a state web would accept is the same string
	 * web writes for it.
	 */
	fun encode(input: TcConsentInput): String {
		val prepared = TcSemanticPreEncoder.prepare(input)
		val day = utcDayDeciseconds(input.confirmedAtMillis)
		val core = TcCoreSegment(
			version = TcCoreSegment.SUPPORTED_VERSION,
			createdDeciseconds = day,
			lastUpdatedDeciseconds = day,
			cmpId = input.cmpId,
			cmpVersion = input.cmpVersion,
			consentScreen = input.consentScreen,
			consentLanguage = prepared.consentLanguage,
			vendorListVersion = input.vendorList.vendorListVersion,
			policyVersion = input.vendorList.tcfPolicyVersion,
			isServiceSpecific = input.isServiceSpecific,
			useNonStandardTexts = false,
			specialFeatureOptins = input.specialFeatureOptins,
			purposeConsents = input.purposeConsents,
			purposeLegitimateInterests = prepared.purposeLegitimateInterests,
			purposeOneTreatment = false,
			publisherCountryCode = input.publisherCountryCode.uppercase(),
			vendorConsents = TcVectorSection.ofIds(prepared.vendorConsents),
			vendorLegitimateInterests = TcVectorSection.ofIds(prepared.vendorLegitimateInterests),
			publisherRestrictions = input.publisherRestrictions,
			)

		val parts = mutableListOf(encodeCore(core, authoring = true))
		parts += encodeSection(TcSegmentType.VENDORS_DISCLOSED.id) {
			TcVectorSection.ofIds(input.vendorsDisclosed).write(it)
		}
		if (input.isServiceSpecific) {
			parts += encodeSection(TcSegmentType.PUBLISHER_TC.id) { input.publisher.write(it)
			}
		}
		return parts.joinToString(".")
	}

	/**
	 * Re-emit [tcString], byte for byte.
	 *
	 * @throws TcEncodingException if the core carries a field this codec declines to write. Ask
	 * [TcCoreSegment.fieldBlockingEncode] first and treat such a string as decode-only.
	 */
	fun encode(tcString: TcString): String {
		val parts = mutableListOf(encodeCore(tcString.core))
		tcString.sections.forEach { section ->
			parts += encodeSection(section.segmentTypeId) { writer ->
				when (section) {
					// Every modelled section carries the bits it was read with, so the re-emit is a
					// copy. Unknown rides the same branch as the rest: its id is its own, and its
					// body goes back verbatim.
					is TcSection.VendorsDisclosed -> section.vendors.write(writer)
					is TcSection.VendorsAllowed -> section.vendors.write(writer)
					is TcSection.PublisherTransparency -> section.publisher.write(writer)
					is TcSection.Unknown -> writer.appendBits(section.bodyBits)
				}
			}
		}
		return parts.joinToString(".")
	}

	/**
	 * Floor [millis] to its UTC day and express it in deciseconds, which is the unit both date
	 * fields hold. `tc-string.ts` floors the confirmation time to a day before the model sees it,
	 * and the format asks for `Date.UTC(...)/100` of a day-level UTC timestamp. A string built from
	 * a raw millisecond clock reads back as a different instant in every timezone but one.
	 */
	fun utcDayDeciseconds(millis: Long): Long {
		val days = Math.floorDiv(millis, TcConsentInput.MILLIS_PER_DAY)
		return days * (TcConsentInput.MILLIS_PER_DAY / TcConsentInput.MILLIS_PER_DECISSECOND)
	}

	private fun encodeCore(core: TcCoreSegment, authoring: Boolean = false): String {
		val writer = BitWriter()
		core.write(writer, authoring = authoring)
		return Base64Url.encodeBits(writer.toBits())
	}

	/**
	 * Encode one dot-segment: its 3-bit SegmentType, then the body, then the one and only padding.
	 *
	 * Padding happens here and nowhere earlier. A body padded on its own and then prefixed with
	 * three bits carries that padding in the middle of the segment, where the next field would read
	 * it; today the zeros sit harmlessly because nothing follows them, and a writer that depends on
	 * that is one field away from writing wrong bytes.
	 */
	private fun encodeSection(segmentTypeId: Int, body: (BitWriter) -> Unit): String {
		val writer = BitWriter()
		writer.appendInt(segmentTypeId.toLong(), TcSegmentType.BITS)
		body(writer)
		return Base64Url.encodeBits(writer.toBits())
	}
}
