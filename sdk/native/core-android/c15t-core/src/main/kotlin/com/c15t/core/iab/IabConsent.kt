package com.c15t.core.iab

import com.c15t.core.tc.*
import kotlinx.serialization.Serializable

/** TCF restriction types: 0 disallows, 1 requires consent, 2 requires LI. */
@Serializable
data class IabPublisherRestriction(val purposeId: Int, val type: Int, val vendorIds: List<Int>)

/** Registered CMP and publisher settings. Registration is verified outside the SDK. */
@Serializable
data class IabConfiguration(
	val cmpId: Int,
	val cmpVersion: Int,
	val publisherCountryCode: String,
	val consentScreen: Int = 1,
	val consentLanguage: String = "EN",
	val numCustomPurposes: Int = 0,
	val publisherRestrictions: List<IabPublisherRestriction> = emptyList(),
)

/** Complete native draft. Absent IDs have no grant; objections cannot overlap LI. */
@Serializable
data class IabChoices(
	val purposeConsents: List<Int> = emptyList(),
	val purposeLegitimateInterests: List<Int> = emptyList(),
	val purposeObjections: List<Int> = emptyList(),
	val vendorConsents: List<Int> = emptyList(),
	val vendorLegitimateInterests: List<Int> = emptyList(),
	val vendorObjections: List<Int> = emptyList(),
	val specialFeatureOptIns: List<Int> = emptyList(),
	val publisherConsents: List<Int> = emptyList(),
	val publisherLegitimateInterests: List<Int> = emptyList(),
	val publisherCustomConsents: List<Int> = emptyList(),
	val publisherCustomLegitimateInterests: List<Int> = emptyList(),
)

/** One durable native IAB decision, read without a JS runtime. */
@Serializable
data class IabCommittedConsent(
	val configuration: IabConfiguration,
	val choices: IabChoices,
	val subjectId: String,
	val externalId: String?,
	val fingerprint: String,
	val vendorListVersion: Int,
	val policyVersion: Int,
	val consentVersion: Int,
	val createdAt: Long,
	val actionAt: Long,
	val tcString: String,
)

internal object IabAuthority {
	val neverLI = setOf(1, 3, 4, 5, 6)

	fun build(
		c: IabConfiguration,
		requested: IabChoices,
		gvl: GlobalVendorList,
		subjectId: String,
		externalId: String?,
		fingerprint: String,
		actionAt: Long,
		previous: IabCommittedConsent?,
	): IabCommittedConsent {
		fun ids(values: List<Int>, allowed: Set<Int>) {
			require(values.size == values.toSet().size && allowed.containsAll(values))
		}
		val list = gvl.toTcVendorList().copy(language = c.consentLanguage)
		val purposes = gvl.purposes.keys.filter { it in 1..24 }.toSet()
		val vendors = list.vendors.filterNot { it.isDeleted }.map { it.id }.toSet()
		val features = gvl.specialFeatures.orEmpty().keys.filter { it in 1..12 }.toSet()
		require(
			c.cmpId in 2..4095 &&
				c.cmpVersion in 0..4095 &&
				c.consentScreen in 0..63 &&
				c.numCustomPurposes in 0..63 &&
				c.consentLanguage.matches(Regex("[A-Z]{2}")) &&
				c.publisherCountryCode.matches(Regex("[A-Z]{2}")) &&
				list.vendorListVersion in 1..65535 &&
				list.tcfPolicyVersion in 2..63 &&
				actionAt >= 0
		)
		ids(requested.purposeConsents, purposes)
		ids(requested.purposeLegitimateInterests, purposes - neverLI)
		ids(requested.purposeObjections, purposes - neverLI)
		ids(requested.vendorConsents, vendors)
		ids(requested.vendorLegitimateInterests, vendors)
		ids(requested.vendorObjections, vendors)
		ids(requested.specialFeatureOptIns, features)
		ids(requested.publisherConsents, purposes)
		ids(requested.publisherLegitimateInterests, purposes - neverLI)
		ids(requested.publisherCustomConsents, (1..c.numCustomPurposes).toSet())
		ids(requested.publisherCustomLegitimateInterests, (1..c.numCustomPurposes).toSet())
		require(
			requested.purposeObjections
				.intersect(requested.purposeLegitimateInterests.toSet())
				.isEmpty()
		)
		require(
			requested.vendorObjections
				.intersect(requested.vendorLegitimateInterests.toSet())
				.isEmpty()
		)
		val restricted = mutableSetOf<String>()
		c.publisherRestrictions.forEach { r ->
			require(r.purposeId in purposes && r.type in 0..2 && r.vendorIds.isNotEmpty())
			ids(r.vendorIds, vendors)
			r.vendorIds.forEach { id ->
				require(restricted.add("${r.purposeId}:$id"))
				val vendor = requireNotNull(list.vendor(id))
				if (r.type == 0)
					require(r.purposeId in vendor.purposes || r.purposeId in vendor.legIntPurposes)
				else {
					require(r.purposeId in vendor.flexiblePurposes)
					require(
						if (r.type == 1) r.purposeId in vendor.legIntPurposes
						else r.purposeId !in neverLI && r.purposeId in vendor.purposes
					)
				}
			}
		}
		if (previous != null) require(previous.consentVersion in 1 until Int.MAX_VALUE)
		val createdAt = previous?.createdAt ?: actionAt
		require(createdAt >= 0 && actionAt >= createdAt)
		val vendorOrder = gvl.vendors.keys.sorted()
		val restrictions =
			TcPublisherRestrictions(
				c.publisherRestrictions
					.groupBy { it.purposeId to it.type }
					.map { (key, entries) ->
						val runs = mutableListOf<TcIdRange>()
						for (id in entries.flatMap { it.vendorIds }.sorted()) {
							val last = runs.lastOrNull()
							if (last != null && vendorOrder.firstOrNull { it > last.end } == id)
								runs[runs.lastIndex] = TcIdRange(last.start, id)
							else runs += TcIdRange(id, id)
						}
						TcPurposeRestriction(key.first, key.second, runs)
					},
				0,
			)
		val input =
			TcConsentInput(
				cmpId = c.cmpId,
				cmpVersion = c.cmpVersion,
				consentScreen = c.consentScreen,
				publisherCountryCode = c.publisherCountryCode,
				confirmedAtMillis = actionAt,
				createdAtMillis = createdAt,
				vendorList = list,
				purposeConsents = requested.purposeConsents,
				purposeLegitimateInterests = requested.purposeLegitimateInterests,
				vendorConsents = requested.vendorConsents,
				vendorLegitimateInterests = requested.vendorLegitimateInterests,
				specialFeatureOptins = requested.specialFeatureOptIns,
				vendorsDisclosed = vendors.sorted(),
				publisherRestrictions = restrictions,
				publisher =
					TcPublisherSegment(
						requested.publisherConsents,
						requested.publisherLegitimateInterests,
						c.numCustomPurposes,
						requested.publisherCustomConsents,
						requested.publisherCustomLegitimateInterests,
					),
			)
		val string = TcStringEncoder.encode(input)
		val prepared = TcSemanticPreEncoder.prepare(input)
		val choices =
			requested.copy(
				vendorConsents = prepared.vendorConsents.sorted(),
				vendorLegitimateInterests = prepared.vendorLegitimateInterests.sorted(),
			)
		return IabCommittedConsent(
				c,
				choices,
				subjectId,
				externalId,
				fingerprint,
				list.vendorListVersion,
				list.tcfPolicyVersion,
				(previous?.consentVersion ?: 0) + 1,
				createdAt,
				actionAt,
				string,
			)
			.detached()
	}

	fun accepting(gvl: GlobalVendorList, c: IabConfiguration): IabChoices {
		val purposes = gvl.purposes.keys.filter { it in 1..24 }.sorted()
		val li = purposes.filterNot { it in neverLI }
		val vendors = gvl.toTcVendorList().vendors.filterNot { it.isDeleted }.map { it.id }.sorted()
		val custom = (1..c.numCustomPurposes.coerceIn(0, 63)).toList()
		return IabChoices(
			purposeConsents = purposes,
			purposeLegitimateInterests = li,
			vendorConsents = vendors,
			vendorLegitimateInterests = vendors,
			specialFeatureOptIns = gvl.specialFeatures.orEmpty().keys.sorted(),
			publisherConsents = purposes,
			publisherLegitimateInterests = li,
			publisherCustomConsents = custom,
			publisherCustomLegitimateInterests = custom,
		)
	}
}

/** The legal basis a native vendor asks permission to use. */
enum class IabLegalBasis {
	CONSENT,
	LEGITIMATE_INTEREST,
}

/** Evaluate vectors and publisher restrictions; the kernel also checks expiry. */
internal fun IabCommittedConsent.allows(
	vendorId: Int,
	purposeId: Int,
	basis: IabLegalBasis,
	gvl: GlobalVendorList,
): Boolean {
	val vendor = gvl.vendors[vendorId] ?: return false
	if (!vendor.deletedDate.isNullOrEmpty()) return false
	val restriction =
		configuration.publisherRestrictions
			.firstOrNull { it.purposeId == purposeId && vendorId in it.vendorIds }
			?.type
	if (restriction == 0) return false
	return when (basis) {
		IabLegalBasis.CONSENT ->
			restriction != 2 &&
				purposeId in choices.purposeConsents &&
				vendorId in choices.vendorConsents &&
				(purposeId.toLong() in vendor.purposes.orEmpty() ||
					restriction == 1 && purposeId.toLong() in vendor.flexiblePurposes.orEmpty())
		IabLegalBasis.LEGITIMATE_INTEREST ->
			restriction != 1 &&
				purposeId in choices.purposeLegitimateInterests &&
				vendorId in choices.vendorLegitimateInterests &&
				purposeId !in choices.purposeObjections &&
				vendorId !in choices.vendorObjections &&
				(purposeId.toLong() in vendor.legIntPurposes.orEmpty() ||
					restriction == 2 && purposeId.toLong() in vendor.flexiblePurposes.orEmpty())
	}
}

internal fun IabConfiguration.detached(): IabConfiguration =
	copy(
		publisherRestrictions =
			publisherRestrictions.map { it.copy(vendorIds = it.vendorIds.toList()) }
	)

internal fun IabChoices.detached(): IabChoices =
	copy(
		purposeConsents = purposeConsents.toList(),
		purposeLegitimateInterests = purposeLegitimateInterests.toList(),
		purposeObjections = purposeObjections.toList(),
		vendorConsents = vendorConsents.toList(),
		vendorLegitimateInterests = vendorLegitimateInterests.toList(),
		vendorObjections = vendorObjections.toList(),
		specialFeatureOptIns = specialFeatureOptIns.toList(),
		publisherConsents = publisherConsents.toList(),
		publisherLegitimateInterests = publisherLegitimateInterests.toList(),
		publisherCustomConsents = publisherCustomConsents.toList(),
		publisherCustomLegitimateInterests = publisherCustomLegitimateInterests.toList(),
	)

internal fun IabCommittedConsent.detached(): IabCommittedConsent =
	copy(configuration = configuration.detached(), choices = choices.detached())

internal fun IabCommittedConsent.isCurrent(now: Long, maxAge: Long): Boolean =
	now >= 0 && actionAt >= 0 && actionAt - now <= 600_000 && maxOf(0, now - actionAt) < maxAge
