package com.inth.core.iab

import com.inth.core.tc.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.security.MessageDigest

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
	val adTechProviderConsents: List<Long>? = null,
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
	/** Custom (non-IAB) vendors with consent, by [IabCustomVendor.id]. Never in the TC String. */
	val customVendorConsents: List<String> = emptyList(),
	/** Custom vendors whose legitimate interest stands. One not listed is objected to. */
	val customVendorLegitimateInterests: List<String> = emptyList(),
) {
	/**
	 * The same choices with custom vendor grants kept only for vendors still in [vendors] and still
	 * declaring that basis, as the web restores its receipt against the current list.
	 */
	internal fun keepingCustomVendors(vendors: List<IabCustomVendor>): IabChoices {
		val consent = vendors.filter { it.purposes.isNotEmpty() }.map { it.id }.toSet()
		val interest = vendors.filter { it.legIntPurposes.isNotEmpty() }.map { it.id }.toSet()
		return copy(
			customVendorConsents = customVendorConsents.filter { it in consent },
			customVendorLegitimateInterests = customVendorLegitimateInterests.filter { it in interest },
		)
	}
}

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
	/** When the first decision in this chain was saved. Record only: the TC String's Created and LastUpdated both carry [actionAt]'s UTC day. */
	val createdAt: Long,
	val actionAt: Long,
	val tcString: String,
	val disclosureID: String? = null,
	val addtlConsent: String? = null,
	val adTechProvidersID: String? = null,
)

internal object IabAuthority {
	fun disclosureID(gvl: GlobalVendorList): String {
		fun canonical(v: JsonElement): JsonElement = when (v) {
			is JsonObject -> JsonObject(v.toSortedMap().mapValues { canonical(it.value) })
			is JsonArray -> JsonArray(v.map { canonical(it) })
			else -> v
		}
		// Older unprefixed hashes may have lost disclosure fields in the typed projection.
		return "gvl-v2:" + MessageDigest.getInstance("SHA-256")
			.digest(canonical(GlobalVendorListJson.toJsonElement(gvl)).toString().toByteArray(Charsets.UTF_8))
			.joinToString("") { "%02x".format(it) }
	}

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
		additionalConsentList: AdditionalConsentList? = null,
		customVendors: List<IabCustomVendor> = emptyList(),
	): IabCommittedConsent {
		fun ids(values: List<Int>, allowed: Set<Int>) {
			require(values.size == values.toSet().size && allowed.containsAll(values))
		}
		val providers = additionalConsentList?.providers.orEmpty()
		val providerIDs = providers.map { it.id }
		val selected = requested.adTechProviderConsents.orEmpty()
		require(selected.size == selected.toSet().size && providerIDs.containsAll(selected))
		val ac = if (providers.isEmpty()) null else AdditionalConsent.encode(selected, providerIDs, requested.purposeConsents)
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
		// Custom vendors: a grant only on a basis the vendor declares. Kept beside the TC String, never
		// in it, as the web keeps them in its authority receipt.
		fun names(values: List<String>, allowed: Set<String>) {
			require(values.size == values.toSet().size && allowed.containsAll(values))
		}
		names(requested.customVendorConsents, customVendors.filter { it.purposes.isNotEmpty() }.map { it.id }.toSet())
		names(requested.customVendorLegitimateInterests, customVendors.filter { it.legIntPurposes.isNotEmpty() }.map { it.id }.toSet())
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
		// `createdAt` keeps the first decision's time for the record. It never reaches the string:
		// TCF requires Created and LastUpdated to hold the same day, and the web build sets both to
		// the confirmation day (`packages/sdk/iab/src/tcf/tc-string.model.ts`).
		val createdAt = previous?.createdAt ?: actionAt
		require(createdAt >= 0 && actionAt >= createdAt)
		val restrictions =
			TcPublisherRestrictions(
				c.publisherRestrictions
					.groupBy { it.purposeId to it.type }
					.map { (key, entries) ->
						val runs = mutableListOf<TcIdRange>()
						for (id in entries.flatMap { it.vendorIds }.sorted()) {
							val last = runs.lastOrNull()
							if (last != null && id == last.end + 1)
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
				adTechProviderConsents = requested.adTechProviderConsents?.let {
					if (requested.purposeConsents.containsAll(listOf(1, 3, 4))) it.sorted() else emptyList()
				},				vendorConsents = prepared.vendorConsents.sorted(),
				vendorLegitimateInterests = prepared.vendorLegitimateInterests.sorted(),
				customVendorConsents = requested.customVendorConsents.sorted(),
				customVendorLegitimateInterests = requested.customVendorLegitimateInterests.sorted(),
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
				disclosureID(gvl),
				ac, if (providers.isEmpty()) null else additionalConsentList?.disclosureID,
			)
			.detached()
	}

	/**
	 * Accept All, as `applyBlanket` in `packages/sdk/iab/src/index.ts`: a signal is positive only for
	 * what some vendor declares on that legal basis once publisher restrictions apply (TCF Policies
	 * 5(3), 5(6) and 5(8)). Listed ad tech providers add purposes 1, 3 and 4. Publisher purposes are
	 * never shown, so they stay unset, as on the web.
	 */
	fun accepting(
		gvl: GlobalVendorList,
		c: IabConfiguration,
		adTechProviders: List<Long>? = null,
		customVendors: List<IabCustomVendor> = emptyList(),
	): IabChoices {
		val disclosures = gvl.vendors.filterValues { it.deletedDate.isNullOrEmpty() }.toSortedMap()
			.map { (id, vendor) -> id to c.disclosure(id, vendor) }
		// Custom vendors count as the web's `applyBlanket` counts them: their purposes, their
		// legitimate-interest purposes TCF allows, and their special features.
		val consent = disclosures.flatMap { it.second.consentPurposes }.toSet() +
			(if (adTechProviders.isNullOrEmpty()) emptySet() else adTechProviderPurposeIds) +
			customVendors.flatMap { it.purposes }
		val interest = disclosures.flatMap { it.second.legitimateInterestPurposes }.toSet() +
			customVendors.flatMap { it.legIntPurposes }.filter { it !in neverLI }
		val purposes = gvl.purposes.keys.filter { it in 1..24 }.sorted()
		return IabChoices(
			adTechProviderConsents = adTechProviders,
			purposeConsents = purposes.filter { it in consent },
			purposeLegitimateInterests = purposes.filter { it in interest },
			vendorConsents = disclosures.filter { it.second.consentPurposes.isNotEmpty() }.map { it.first },
			vendorLegitimateInterests = disclosures.filter { it.second.legitimateInterestPurposes.isNotEmpty() }.map { it.first },
			specialFeatureOptIns = gvl.declaredSpecialFeatureIds(customVendors),
			customVendorConsents = customVendors.filter { it.purposes.isNotEmpty() }.map { it.id }.sorted(),
			customVendorLegitimateInterests = customVendors.filter { it.legIntPurposes.isNotEmpty() }.map { it.id }.sorted(),
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
    return when (basis) {
        IabLegalBasis.CONSENT -> configuration.discloses(vendorId, vendor, purposeId, IabLegalBasis.CONSENT) && purposeId in choices.purposeConsents && vendorId in choices.vendorConsents
        IabLegalBasis.LEGITIMATE_INTEREST -> configuration.discloses(vendorId, vendor, purposeId, IabLegalBasis.LEGITIMATE_INTEREST) && purposeId in choices.purposeLegitimateInterests && vendorId in choices.vendorLegitimateInterests && purposeId !in choices.purposeObjections && vendorId !in choices.vendorObjections
    }
}

internal fun IabConfiguration.detached(): IabConfiguration =
	copy(
		publisherRestrictions =
			publisherRestrictions.map { it.copy(vendorIds = it.vendorIds.toList()) }
	)

internal fun IabChoices.detached(): IabChoices =
	copy(
		adTechProviderConsents = adTechProviderConsents?.toList(),
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
		customVendorConsents = customVendorConsents.toList(),
		customVendorLegitimateInterests = customVendorLegitimateInterests.toList(),
	)

internal fun IabCommittedConsent.detached(): IabCommittedConsent =
	copy(configuration = configuration.detached(), choices = choices.detached())

internal fun IabCommittedConsent.isCurrent(now: Long, maxAge: Long): Boolean =
	now >= 0 && actionAt >= 0 && actionAt - now <= 600_000 && maxOf(0, now - actionAt) < maxAge

/** Compact availability; no GVL serialization is needed for these reads. */
enum class IabListAvailability { UNAVAILABLE, MISSING, FRESH, CACHED, OFFLINE, STALE }
data class IabLifecycleStatus(
	val availability: IabListAvailability,
	val requiresConsent: Boolean,
	val revision: Long,
	val vendorListVersion: Long?,
	val policyVersion: Long?,
)
/** Preferences session bound to the disclosure revision it opened on. */
data class IabDraft(val revision: Long, val choices: IabChoices)
