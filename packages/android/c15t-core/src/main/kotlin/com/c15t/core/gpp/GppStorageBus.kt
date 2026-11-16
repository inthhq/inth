package com.c15t.core.gpp

import com.c15t.core.iab.IabCommittedConsent
import com.c15t.core.store.TcBusValue
import com.c15t.core.store.TcStorageBusKeys
import com.c15t.core.store.TcStorageBusProjection

/**
 * The `IABGPP_*` in-app keys, from the GPP CMP API specification ("In-App Key Names")
 * and the IAB Europe TCF section's key table.
 *
 * The CMP API defines the header keys, `IABGPP_GppSID` and `IABGPP_[SectionID]_String`.
 * The TCF EU section maps each `IABTCF_*` key to an `IABGPP_TCFEU2_*` key, with the TC
 * String at `IABGPP_2_TCString`. The two documents name the TC String's key differently,
 * so both are written. No document defines per-field keys for US National, so none are
 * written; a vendor reads the section from `IABGPP_7_String` or the full string.
 */
object GppStorageBusKeys {
	const val HDR_VERSION: String = "IABGPP_HDR_Version"
	const val HDR_SECTIONS: String = "IABGPP_HDR_Sections"
	const val HDR_GPP_STRING: String = "IABGPP_HDR_GppString"
	const val GPP_SID: String = "IABGPP_GppSID"
	const val TCF_EU_TC_STRING: String = "IABGPP_2_TCString"

	/** `IABGPP_[SectionID]_String`. */
	fun sectionString(sectionId: Int): String = "IABGPP_${sectionId}_String"

	/** `IABTCF_*` key to `IABGPP_TCFEU2_*` key, as the TCF EU section's table lists them. */
	val TCF_EU_KEYS: Map<String, String> = buildMap {
		fun map(tcf: String, suffix: String) = put(tcf, "IABGPP_TCFEU2_$suffix")
		map(TcStorageBusKeys.CMP_SDK_ID, "CmpSdkID")
		map(TcStorageBusKeys.CMP_SDK_VERSION, "CmpSdkVersion")
		map(TcStorageBusKeys.POLICY_VERSION, "PolicyVersion")
		map(TcStorageBusKeys.GDPR_APPLIES, "gdprApplies")
		map(TcStorageBusKeys.PUBLISHER_CC, "PublisherCC")
		map(TcStorageBusKeys.PURPOSE_ONE_TREATMENT, "PurposeOneTreatment")
		// The table still uses TCF 2.0's name for what TCF 2.2 calls UseNonStandardTexts.
		map(TcStorageBusKeys.USE_NON_STANDARD_TEXTS, "UseNonStandardStacks")
		map(TcStorageBusKeys.VENDOR_CONSENTS, "VendorConsents")
		map(TcStorageBusKeys.VENDOR_LEGITIMATE_INTERESTS, "VendorLegitimateInterests")
		map(TcStorageBusKeys.PURPOSE_CONSENTS, "PurposeConsents")
		map(TcStorageBusKeys.PURPOSE_LEGITIMATE_INTERESTS, "PurposeLegitimateInterests")
		map(TcStorageBusKeys.SPECIAL_FEATURES_OPT_INS, "SpecialFeaturesOptIns")
		map(TcStorageBusKeys.PUBLISHER_CONSENT, "PublisherConsent")
		map(TcStorageBusKeys.PUBLISHER_LEGITIMATE_INTERESTS, "PublisherLegitimateInterests")
		map(TcStorageBusKeys.PUBLISHER_CUSTOM_PURPOSES_CONSENTS, "PublisherCustomPurposesConsents")
		map(TcStorageBusKeys.PUBLISHER_CUSTOM_PURPOSES_LEGITIMATE_INTERESTS, "PublisherCustomPurposesLegitimateInterests")
		for (purpose in 1..63) map(TcStorageBusKeys.PUBLISHER_RESTRICTIONS + purpose, "PublisherRestrictions$purpose")
	}

	/** Every key this core owns, so a publication can remove the ones that no longer apply. */
	val ALL_NAMES: List<String> = listOf(
		HDR_VERSION,
		HDR_SECTIONS,
		HDR_GPP_STRING,
		GPP_SID,
		TCF_EU_TC_STRING,
		sectionString(GPP_TCF_EU_SECTION_ID),
		sectionString(GppUsNational.ID),
	) + TCF_EU_KEYS.values
}

/** Egress only: the in-app projection of a [GppSignal]. Never read back as consent. */
internal object GppStorageBusProjection {
	/**
	 * The `IABGPP_*` rows for [signal].
	 *
	 * Lists of IDs use the CMP API's in-app form, joined with `_`. The `IABGPP_TCFEU2_*`
	 * rows repeat the `IABTCF_*` values decoded from the same TC String, as the TCF EU
	 * section's table asks, and are written only when that TC String is the section.
	 *
	 * @param signal the signal the snapshot reports, `null` for none.
	 * @param iabConsent the committed IAB consent, only while it is valid.
	 */
	fun values(signal: GppSignal?, iabConsent: IabCommittedConsent?): Map<String, TcBusValue> {
		if (signal == null) return emptyMap()
		val ids = signal.sectionIds.joinToString("_")
		val values = mutableMapOf<String, TcBusValue>(
			GppStorageBusKeys.HDR_VERSION to TcBusValue.TextValue(GppEncoder.HEADER_VERSION.toString()),
			GppStorageBusKeys.HDR_SECTIONS to TcBusValue.TextValue(ids),
			GppStorageBusKeys.HDR_GPP_STRING to TcBusValue.TextValue(signal.gppString),
			GppStorageBusKeys.GPP_SID to TcBusValue.TextValue(ids),
		)
		for (section in signal.sections) {
			values[GppStorageBusKeys.sectionString(section.id)] = TcBusValue.TextValue(section.encoded)
		}
		val tcf = signal.sections.firstOrNull { it.id == GPP_TCF_EU_SECTION_ID }
		if (tcf != null && iabConsent != null && iabConsent.tcString == tcf.encoded) {
			values[GppStorageBusKeys.TCF_EU_TC_STRING] = TcBusValue.TextValue(tcf.encoded)
			values[GppStorageBusKeys.TCF_EU_KEYS.getValue(TcStorageBusKeys.GDPR_APPLIES)] = TcBusValue.NumberValue(1)
			for ((key, value) in TcStorageBusProjection.decisionValues(iabConsent)) {
				GppStorageBusKeys.TCF_EU_KEYS[key]?.let { values[it] = value }
			}
		}
		return values
	}
}
