package com.inth.core.iab

import java.net.URI
import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.*

/** Google ATPs are separate from GVL vendor IDs and from ATT. */
@Serializable
data class AdTechProvider(val id: Long, val name: String, val policyUrl: String)

/** Null means unavailable. An explicitly empty list disables AC. */
@Serializable
data class AdditionalConsentList(val providers: List<AdTechProvider>, val fetchedAt: Long) {
	fun isCurrent(now: Long, maxAge: Long) = fetchedAt >= 0 && now >= fetchedAt && now - fetchedAt < maxAge
	val disclosureID: String get() = MessageDigest.getInstance("SHA-256")
		.digest(Json.encodeToString(ListSerializer(AdTechProvider.serializer()), providers).toByteArray(Charsets.UTF_8))
		.joinToString("") { "%02x".format(it) }
}

/** Native AC v2. https://support.google.com/admanager/answer/9681920 */
object AdditionalConsent {
	internal fun providers(value: JsonElement?): List<AdTechProvider>? {
		val rows = value as? JsonArray ?: return null
		return try {
			val ids = mutableSetOf<Long>()
			rows.map { row ->
				val provider = Json.decodeFromJsonElement(AdTechProvider.serializer(), row)
				val uri = URI(provider.policyUrl)
				require(provider.id in 1..9_007_199_254_740_991L && ids.add(provider.id) &&
					provider.name.isNotBlank() && uri.scheme?.lowercase() in setOf("http", "https") && uri.host != null)
				provider.copy(name = provider.name.trim())
			}.sortedBy { it.id }
		} catch (_: Exception) { null }
	}

	/** Consented IDs must have been disclosed; purposes 1, 3 and 4 gate all ATP grants. */
	fun encode(consented: List<Long>, disclosed: List<Long>, purposeConsents: List<Int>): String {
		val shown = disclosed.toSet()
		require(shown.size == disclosed.size && shown.all { it in 1..9_007_199_254_740_991L } &&
			consented.size == consented.toSet().size && shown.containsAll(consented))
		val grants = if (purposeConsents.containsAll(listOf(1, 3, 4))) consented.toSet() else emptySet()
		return "2~" + grants.sorted().joinToString(".") + "~dv." + (shown - grants).sorted().joinToString(".")
	}
}
