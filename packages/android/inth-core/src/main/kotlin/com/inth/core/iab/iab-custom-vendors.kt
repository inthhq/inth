package com.inth.core.iab

import com.inth.core.model.ConsentCategory
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.longOrNull
import java.net.URI

/**
 * A custom vendor: a partner the publisher declares under IAB TCF that is not on the Global Vendor
 * List. `NonIABVendor` in `@inth/sdk-schema` (`packages/sdk/schema/src/shared/non-iab-vendor.ts`), served by
 * `/init` as `customVendors`.
 *
 * The stock screens list it beside the registered vendors and it gets its own consent and
 * legitimate-interest choices, kept in [IabChoices.customVendorConsents] and
 * [IabChoices.customVendorLegitimateInterests]. The TC String never carries it: it has only IAB
 * vendor ids.
 *
 * @property id The id as the web keys its consent maps, `String(vendor.id)`: a numeric id becomes
 * its decimal form.
 */
@Serializable
data class IabCustomVendor(
	val id: String,
	val name: String,
	val privacyPolicyUrl: String,
	/** TCF purposes it asks consent for. */
	val purposes: List<Int>,
	/** TCF purposes it claims under legitimate interest. */
	val legIntPurposes: List<Int> = emptyList(),
	val specialFeatures: List<Int> = emptyList(),
	val features: List<Int> = emptyList(),
	val dataCategories: List<Int> = emptyList(),
	val description: String? = null,
	val cookieMaxAgeSeconds: Int? = null,
	val dataRetentionDays: Int? = null,
	val usesCookies: Boolean = false,
	val usesNonCookieAccess: Boolean = false,
) {
	companion object {
		/**
		 * Read `/init`'s `customVendors` with `nonIABVendorSchema`'s rules. Null when any entry breaks
		 * them or two entries share an id: a list read in part would disclose a partner set nobody
		 * configured, so the core holds none instead, as for ad tech providers.
		 */
		internal fun list(value: JsonElement?): List<IabCustomVendor>? {
			val entries = value as? JsonArray ?: return null
			val ids = mutableSetOf<String>()
			val result = mutableListOf<IabCustomVendor>()
			for (entry in entries) {
				val vendor = read(entry) ?: return null
				if (!ids.add(vendor.id)) return null
				result += vendor
			}
			return result
		}

		private fun read(value: JsonElement): IabCustomVendor? {
			val fields = value as? JsonObject ?: return null
			fun present(key: String): JsonElement? = fields[key]?.takeUnless { it is JsonNull }
			fun whole(element: JsonElement?): Long? {
				val primitive = element as? JsonPrimitive ?: return null
				if (primitive.isString) return null
				return primitive.longOrNull ?: primitive.content.toDoubleOrNull()?.takeIf { it % 1.0 == 0.0 && kotlin.math.abs(it) < 9.007199254740992E15 }?.toLong()
			}
			// `null` for a missing optional list reads as empty; a bad list refuses the entry.
			fun ids(key: String, range: IntRange, required: Boolean = false): List<Int>? {
				val raw = present(key) ?: return if (required) null else emptyList()
				val items = raw as? JsonArray ?: return null
				return items.map { item -> whole(item)?.takeIf { it in range.first..range.last }?.toInt() ?: return null }
			}
			fun positive(key: String): Result<Int?> {
				val raw = present(key) ?: return Result.success(null)
				val number = whole(raw)?.takeIf { it in 1..Int.MAX_VALUE } ?: return Result.failure(IllegalArgumentException(key))
				return Result.success(number.toInt())
			}
			fun flag(key: String): Boolean? {
				val raw = present(key) ?: return false
				val primitive = raw as? JsonPrimitive ?: return null
				return if (primitive.isString) null else primitive.booleanOrNull
			}
			val rawId = present("id") as? JsonPrimitive ?: return null
			val id = if (rawId.isString) rawId.content else whole(rawId)?.toString() ?: return null
			val name = (present("name") as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
			val url = (present("privacyPolicyUrl") as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
			val scheme = try { URI(url).scheme } catch (_: Exception) { null }
			if (scheme.isNullOrEmpty()) return null
			val description = when (val raw = present("description")) {
				null -> null
				is JsonPrimitive -> if (raw.isString) raw.content else return null
				else -> return null
			}
			return IabCustomVendor(
				id = id,
				name = name,
				privacyPolicyUrl = url,
				purposes = ids("purposes", 1..11, required = true) ?: return null,
				legIntPurposes = ids("legIntPurposes", 1..11) ?: return null,
				specialFeatures = ids("specialFeatures", 1..2) ?: return null,
				features = ids("features", 1..3) ?: return null,
				dataCategories = ids("dataCategories", 1..11) ?: return null,
				description = description,
				cookieMaxAgeSeconds = positive("cookieMaxAgeSeconds").getOrElse { return null },
				dataRetentionDays = positive("dataRetentionDays").getOrElse { return null },
				usesCookies = flag("usesCookies") ?: return null,
				usesNonCookieAccess = flag("usesNonCookieAccess") ?: return null,
			)
		}
	}
}

/** The same summary as [IabVendorDisclosure.selectionStatus], for a custom vendor. */
fun IabCustomVendor.selectionStatus(choices: IabChoices): IabVendorSelectionStatus {
	val consent = purposes.map { id in choices.customVendorConsents && it in choices.purposeConsents }
	val interest = legIntPurposes.filter { it !in IabAuthority.neverLI }.map {
		id in choices.customVendorLegitimateInterests && it in choices.purposeLegitimateInterests &&
			it !in choices.purposeObjections
	}
	val enabled = consent + interest
	return when {
		enabled.none { it } -> IabVendorSelectionStatus.OFF
		enabled.all { it } -> IabVendorSelectionStatus.ON
		else -> IabVendorSelectionStatus.PARTIAL
	}
}

/**
 * The Inth categories an IAB TCF decision grants, by the web's derivation:
 * `iabPurposesToInthConsents` and `INTH_TO_IAB_PURPOSE_MAP` in
 * `packages/sdk/iab/src/tcf/purpose-mapping.ts`, with the purposes some vendor processes on consent
 * deciding, as `consentBasisPurposes` in `packages/sdk/iab/src/index.ts` passes them. Registered vendors
 * after publisher restrictions, custom vendors and listed ad tech providers all count toward that
 * basis. `packages/native-protocol/iab/purpose-categories.json` runs the same cases on web, Swift and Kotlin.
 */
object IabPurposeCategories {
	/** `INTH_TO_IAB_PURPOSE_MAP` without `necessary`, which is always granted. */
	val purposes: Map<ConsentCategory, List<Int>> = mapOf(
		ConsentCategory.EXPERIENCE to listOf(5, 6),
		ConsentCategory.FUNCTIONALITY to listOf(10, 11),
		ConsentCategory.MARKETING to listOf(2, 3, 4),
		ConsentCategory.MEASUREMENT to listOf(7, 8, 9),
	)

	/**
	 * Purposes some vendor processes on consent: each registered vendor's consent purposes after
	 * publisher restrictions, each custom vendor's purposes, and 1, 3 and 4 when ad tech providers
	 * are listed.
	 */
	fun consentBasis(
		vendorConsentPurposes: Collection<List<Int>>,
		customVendors: List<IabCustomVendor>,
		adTechProvidersListed: Boolean,
	): Set<Int> =
		vendorConsentPurposes.flatten().toSet() + customVendors.flatMap { it.purposes } +
			if (adTechProvidersListed) adTechProviderPurposeIds else emptySet()

	/** The purposes that decide [category]: those in [basis], or all of them when none is. */
	fun deciding(category: ConsentCategory, basis: Set<Int>): Set<Int> {
		val all = purposes[category].orEmpty().toSet()
		return (all intersect basis).ifEmpty { all }
	}

	/** Every optional category, granted when all of its deciding purposes are consented. */
	fun categories(purposeConsents: Set<Int>, basis: Set<Int>): Map<ConsentCategory, Boolean> =
		purposes.keys.associateWith { purposeConsents.containsAll(deciding(it, basis)) }
}
