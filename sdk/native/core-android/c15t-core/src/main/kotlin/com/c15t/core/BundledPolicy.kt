package com.c15t.core

import com.c15t.core.model.KernelOverrides
import com.c15t.core.model.ConsentModel
import com.c15t.core.policy.PolicyPrompt
import com.c15t.core.policy.PolicyRead
import com.c15t.core.policy.StrictPolicyReader
import com.c15t.core.transport.InitMapper
import com.c15t.core.transport.MappedInit
import com.c15t.core.transport.TransportOutcome
import java.security.MessageDigest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/** Build authority, not a visitor decision or a network refresh timestamp. */
@Serializable
data class BundledPolicyAuthority(
	val endpoint: String,
	val issuedAt: Long,
	val expiresAt: Long,
	val manifestRevision: String,
	val requiresAtp: Boolean = false,
) {
	fun isCurrent(endpoint: String, now: Long) = this.endpoint == endpoint.trimEnd('/') &&
		issuedAt >= 0 && now >= issuedAt && now < expiresAt && expiresAt > issuedAt
}

/** Reads a build resource before JavaScript. Invalid data never contributes authority. */
object BundledPolicy {
	internal data class Selection(val authority: BundledPolicyAuthority, val mapped: MappedInit,
		val gvlFetchedAt: Long?, val atpFetchedAt: Long?)

	internal fun resolve(resource: String, endpoint: String, overrides: KernelOverrides, now: Long): Selection? = try {
		val wrapper = Json.parseToJsonElement(resource).jsonObject
		val payload = wrapper.getValue("payload").jsonPrimitive.content
		val checksum = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
		require(wrapper.size == 2 && wrapper["sha256"]?.jsonPrimitive?.content == checksum)
		val value = Json.parseToJsonElement(payload).jsonObject
		require(value["schemaVersion"]?.jsonPrimitive?.int == 1 && value.keys.all { it in setOf("schemaVersion", "endpoint", "manifestRevision", "tenantId", "issuedAt", "expiresAt", "defaultLanguage", "requiresAtp", "policyPacks", "disclosures") })
		val authority = BundledPolicyAuthority(value.getValue("endpoint").jsonPrimitive.content,
			value.getValue("issuedAt").jsonPrimitive.long, value.getValue("expiresAt").jsonPrimitive.long,
			value.getValue("manifestRevision").jsonPrimitive.content, value["requiresAtp"]?.jsonPrimitive?.boolean == true)
		require(authority.manifestRevision.isNotEmpty() && authority.isCurrent(endpoint, now))
		val packs = value.getValue("policyPacks").jsonArray.map { it.jsonObject }
		require(packs.isNotEmpty())
		packs.forEach { require(StrictPolicyReader.read(it["policyResolution"]) is PolicyRead.Matched) }
		val unknown = match(packs, null, null) ?: error("Unknown geography requires an authored opt-in default")
		val conservative = (StrictPolicyReader.read(packs[unknown.first]["policyResolution"]) as PolicyRead.Matched).policy
		require(conservative.model in listOf(ConsentModel.OPT_IN, ConsentModel.IAB) && conservative.prompt == PolicyPrompt.CHOICE && packs[unknown.first].getValue("policyResolution").jsonObject.getValue("policy").jsonObject.getValue("preselectedCategories").jsonArray.isEmpty())
		val selected = match(packs, overrides.country, overrides.region) ?: error("No policy match")
		val pack = packs[selected.first]
		val wire = JsonObject(pack.getValue("policyResolution").jsonObject + ("matchedBy" to JsonPrimitive(selected.second)))
		val translations = pack.getValue("translations").jsonObject
		val fallback = value.getValue("defaultLanguage").jsonPrimitive.content
		val language = overrides.language?.lowercase()?.substringBefore('-') ?: fallback
		val copy = translations[language] ?: translations.getValue(fallback)
		val disclosures = value["disclosures"]?.jsonObject
		val gvl = disclosures?.get("gvl")?.jsonObject
		val atp = disclosures?.get("atp")?.jsonObject
		val body = buildJsonObject {
			put("policyResolution", wire)
			put("translations", copy)
			put("location", buildJsonObject { put("countryCode", overrides.country?.let(::JsonPrimitive) ?: JsonNull); put("regionCode", overrides.region?.let(::JsonPrimitive) ?: JsonNull) })
			gvl?.get("data")?.let { put("gvl", it) }
			atp?.get("providers")?.let { put("adTechProviders", it) }
		}
		val mapped = InitMapper.map(TransportOutcome.Success(body, emptyMap()))
		require(!mapped.policyPending)
		Selection(authority, mapped, gvl?.get("fetchedAt")?.jsonPrimitive?.longOrNull?.takeIf { it in 0..authority.issuedAt }, atp?.get("fetchedAt")?.jsonPrimitive?.longOrNull?.takeIf { it in 0..authority.issuedAt })
	} catch (_: Exception) { null }

	// Same precedence as schema matchPolicyRules. Language never enters this matcher.
	private fun match(packs: List<JsonObject>, country: String?, region: String?): Pair<Int, String>? {
		fun countryCode(value: String?) = value?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
		fun regionCode(value: String?) = countryCode(value?.substringAfterLast('-'))
		val c = countryCode(country); val r = regionCode(region)
		fun first(predicate: (JsonObject) -> Boolean) = packs.indexOfFirst { predicate(it.getValue("match").jsonObject) }.takeIf { it >= 0 }
		fun includes(m: JsonObject, key: String) = m[key]?.jsonArray?.any { countryCode(it.jsonPrimitive.content) == c } == true
		val fallback = first { it["fallback"]?.jsonPrimitive?.booleanOrNull == true }
		if (c != null) {
			if (r != null) first { m -> m["regions"]?.jsonArray?.any { countryCode(it.jsonObject["country"]?.jsonPrimitive?.content) == c && regionCode(it.jsonObject["region"]?.jsonPrimitive?.content) == r } == true }?.let { return it to "region" }
			first { includes(it, "countries") }?.let { return it to "country" }
			if (r == null) {
				first { includes(it, "regionFallbacks") }?.let { return it to "fallback" }
				if (first { m -> m["regions"]?.jsonArray?.any { countryCode(it.jsonObject["country"]?.jsonPrimitive?.content) == c } == true } != null) return fallback?.let { it to "fallback" }
			}
		} else if (fallback != null) return fallback to "fallback"
		return first { it["isDefault"]?.jsonPrimitive?.booleanOrNull == true }?.let { it to "default" }
	}
}
