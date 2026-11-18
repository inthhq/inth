package com.inth.core.store

import com.inth.core.iab.IabConfiguration
import com.inth.core.iab.IabCommittedConsent
import com.inth.core.model.ConsentModel
import com.inth.core.model.PolicyResolution
import com.inth.core.tc.TcStringDecoder

/** Native types from the IAB CMP API in-app storage table. */
public sealed interface TcBusValue {
	public data class NumberValue(public val value: Int) : TcBusValue
	public data class TextValue(public val value: String) : TcBusValue
}

/** CMP API v2 in-app keys, including Google's AC extension and numbered restrictions. */
public object TcStorageBusKeys {
	public const val CMP_SDK_ID: String = "IABTCF_CmpSdkID"
	public const val CMP_SDK_VERSION: String = "IABTCF_CmpSdkVersion"
	public const val POLICY_VERSION: String = "IABTCF_PolicyVersion"
	public const val GDPR_APPLIES: String = "IABTCF_gdprApplies"
	public const val PUBLISHER_CC: String = "IABTCF_PublisherCC"
	public const val PURPOSE_ONE_TREATMENT: String = "IABTCF_PurposeOneTreatment"
	public const val USE_NON_STANDARD_TEXTS: String = "IABTCF_UseNonStandardTexts"
	public const val TC_STRING: String = "IABTCF_TCString"
	public const val VENDOR_CONSENTS: String = "IABTCF_VendorConsents"
	public const val VENDOR_LEGITIMATE_INTERESTS: String = "IABTCF_VendorLegitimateInterests"
	public const val DISCLOSED_VENDORS: String = "IABTCF_DisclosedVendors"
	public const val PURPOSE_CONSENTS: String = "IABTCF_PurposeConsents"
	public const val PURPOSE_LEGITIMATE_INTERESTS: String = "IABTCF_PurposeLegitimateInterests"
	public const val SPECIAL_FEATURES_OPT_INS: String = "IABTCF_SpecialFeaturesOptIns"
	public const val PUBLISHER_RESTRICTIONS: String = "IABTCF_PublisherRestrictions"
	public const val PUBLISHER_CONSENT: String = "IABTCF_PublisherConsent"
	public const val PUBLISHER_LEGITIMATE_INTERESTS: String = "IABTCF_PublisherLegitimateInterests"
	public const val PUBLISHER_CUSTOM_PURPOSES_CONSENTS: String = "IABTCF_PublisherCustomPurposesConsents"
	public const val PUBLISHER_CUSTOM_PURPOSES_LEGITIMATE_INTERESTS: String = "IABTCF_PublisherCustomPurposesLegitimateInterests"
	public const val ADDTL_CONSENT: String = "IABTCF_AddtlConsent"

	/** Owned names, including all numbered purposes and the obsolete bare prefix. */
	public val ALL_NAMES: List<String> = listOf(
		CMP_SDK_ID,
		CMP_SDK_VERSION,
		POLICY_VERSION,
		GDPR_APPLIES,
		PUBLISHER_CC,
		PURPOSE_ONE_TREATMENT,
		USE_NON_STANDARD_TEXTS,
		TC_STRING,
		VENDOR_CONSENTS,
		VENDOR_LEGITIMATE_INTERESTS,
		DISCLOSED_VENDORS,
		PURPOSE_CONSENTS,
		PURPOSE_LEGITIMATE_INTERESTS,
		SPECIAL_FEATURES_OPT_INS,
		PUBLISHER_RESTRICTIONS,
		PUBLISHER_CONSENT,
		PUBLISHER_LEGITIMATE_INTERESTS,
		PUBLISHER_CUSTOM_PURPOSES_CONSENTS,
		PUBLISHER_CUSTOM_PURPOSES_LEGITIMATE_INTERESTS,
		ADDTL_CONSENT,
	) + (1..63).map { PUBLISHER_RESTRICTIONS + it }
}

/** Egress only. The core validates authority before supplying it. */
internal object TcStorageBusProjection {
	fun detection(configuration: IabConfiguration?): Map<String, TcBusValue> {
		val c = configuration ?: return emptyMap()
		if (c.cmpId !in 2..4095 || c.cmpVersion !in 0..4095) return emptyMap()
		return mapOf(TcStorageBusKeys.CMP_SDK_ID to TcBusValue.NumberValue(c.cmpId),
			TcStorageBusKeys.CMP_SDK_VERSION to TcBusValue.NumberValue(c.cmpVersion))
	}
	fun values(envelope: SnapshotEnvelope, configuration: IabConfiguration? = null): Map<String, TcBusValue> {
		val values = detection(configuration).toMutableMap()
		envelope.gvl?.let { values[TcStorageBusKeys.POLICY_VERSION] = TcBusValue.NumberValue(it.tcfPolicyVersion.toInt()) }
		if (envelope.snapshot.policyPending || envelope.snapshot.resolution.status != PolicyResolution.STATUS_MATCHED) return values
		val isIab = envelope.evaluationPolicy?.model == ConsentModel.IAB
		values[TcStorageBusKeys.GDPR_APPLIES] = TcBusValue.NumberValue(if (isIab) 1 else 0)
		if (isIab) envelope.iabConsent?.let { values.putAll(decisionValues(it)) }
		return values
	}

	/** Every consent row comes from the exact TC bytes, including shaped vendor vectors. */
	fun decisionValues(saved: IabCommittedConsent): Map<String, TcBusValue> {
		val tc = try { TcStringDecoder.decode(saved.tcString) } catch (_: IllegalArgumentException) { return emptyMap() }
		val core = tc.core
		fun bits(ids: Collection<Int>, width: Int): TcBusValue {
			val set = ids.toSet()
			return TcBusValue.TextValue((1..width).joinToString("") { if (it in set) "1" else "0" })
		}
		val values = mutableMapOf<String, TcBusValue>(
			TcStorageBusKeys.CMP_SDK_ID to TcBusValue.NumberValue(core.cmpId),
			TcStorageBusKeys.CMP_SDK_VERSION to TcBusValue.NumberValue(core.cmpVersion),
			TcStorageBusKeys.POLICY_VERSION to TcBusValue.NumberValue(core.policyVersion),
			TcStorageBusKeys.PUBLISHER_CC to TcBusValue.TextValue(core.publisherCountryCode),
			TcStorageBusKeys.PURPOSE_ONE_TREATMENT to TcBusValue.NumberValue(if (core.purposeOneTreatment) 1 else 0),
			TcStorageBusKeys.USE_NON_STANDARD_TEXTS to TcBusValue.NumberValue(if (core.useNonStandardTexts) 1 else 0),
			TcStorageBusKeys.TC_STRING to TcBusValue.TextValue(saved.tcString),
			TcStorageBusKeys.VENDOR_CONSENTS to bits(core.vendorConsents.ids, core.vendorConsents.maxId),
			TcStorageBusKeys.VENDOR_LEGITIMATE_INTERESTS to bits(core.vendorLegitimateInterests.ids, core.vendorLegitimateInterests.maxId),
			TcStorageBusKeys.PURPOSE_CONSENTS to bits(core.purposeConsents, 24),
			TcStorageBusKeys.PURPOSE_LEGITIMATE_INTERESTS to bits(core.purposeLegitimateInterests, 24),
			TcStorageBusKeys.SPECIAL_FEATURES_OPT_INS to bits(core.specialFeatureOptins, 12),
		)
		tc.vendorsDisclosed?.let { values[TcStorageBusKeys.DISCLOSED_VENDORS] = bits(it.ids, it.maxId) }
		tc.publisher?.let {
			values[TcStorageBusKeys.PUBLISHER_CONSENT] = bits(it.publisherConsents, 24)
			values[TcStorageBusKeys.PUBLISHER_LEGITIMATE_INTERESTS] = bits(it.publisherLegitimateInterests, 24)
			values[TcStorageBusKeys.PUBLISHER_CUSTOM_PURPOSES_CONSENTS] = bits(it.publisherCustomConsents, it.numCustomPurposes)
			values[TcStorageBusKeys.PUBLISHER_CUSTOM_PURPOSES_LEGITIMATE_INTERESTS] = bits(it.publisherCustomLegitimateInterests, it.numCustomPurposes)
		}
		// IAB's reference InAppTCData uses '_' for an unrestricted vendor.
		val restrictions = core.publisherRestrictions.restrictions
		val width = restrictions.flatMap { it.vendorIds }.maxOrNull() ?: 0
		for (purpose in restrictions.map { it.purposeId }.toSet()) {
			val row = CharArray(width) { '_' }
			for (r in restrictions.filter { it.purposeId == purpose })
				for (id in r.vendorIds) row[id - 1] = ('0'.code + r.restrictionTypeValue).toChar()
			values[TcStorageBusKeys.PUBLISHER_RESTRICTIONS + purpose] = TcBusValue.TextValue(row.concatToString())
		}
		saved.addtlConsent?.let { values[TcStorageBusKeys.ADDTL_CONSENT] = TcBusValue.TextValue(it) }
		return values
	}
}

/** Replace the owned table in application-default SharedPreferences using putInt/putString.
 * Publish atomically, or remove TC/AC markers before associated values and publish them last.
 * Never read this mirror as consent. Failures must leave no published grant and be repairable.
 */
public interface TcStorageBusSink {
	public fun write(values: Map<String, TcBusValue>)
	public fun clear()
}
