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

/**
 * Build authority, not a visitor decision or a network refresh timestamp.
 *
 * A manifest bundled for one backend stays usable after [expiresAt]: an offline device
 * still shows the prompt and records choices from it, and the core reports the age
 * through `ConsentCore.onPolicyStale`. Nothing is granted until the person chooses.
 */
@Serializable
data class BundledPolicyAuthority(
	val endpoint: String,
	val issuedAt: Long,
	val expiresAt: Long,
	val manifestRevision: String,
	val requiresAtp: Boolean = false,
) {
	/** Bound to [endpoint] and already issued. Expiry does not end usability. */
	fun isUsable(endpoint: String?, now: Long) = endpoint != null && this.endpoint == endpoint.trimEnd('/') &&
		issuedAt >= 0 && now >= issuedAt && expiresAt > issuedAt

	/** Past [expiresAt]. A stale manifest still prompts, and the core emits `policyStale`. */
	fun isStale(now: Long) = now >= expiresAt
}

/** Reads a build resource before JavaScript. Invalid data never contributes authority. */
object BundledPolicy {
	internal data class Selection(val authority: BundledPolicyAuthority, val mapped: MappedInit,
		val gvlFetchedAt: Long?, val atpFetchedAt: Long?)

	internal fun resolve(resource: String, endpoint: String?, overrides: KernelOverrides, now: Long): Selection? = try {
		val wrapper = Json.parseToJsonElement(resource).jsonObject
		val payload = wrapper.getValue("payload").jsonPrimitive.content
		val checksum = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
		require(wrapper.size == 2 && wrapper["sha256"]?.jsonPrimitive?.content == checksum)
		val value = Json.parseToJsonElement(payload).jsonObject
		require(value["schemaVersion"]?.jsonPrimitive?.int == 1 && value.keys.all { it in setOf("schemaVersion", "endpoint", "manifestRevision", "tenantId", "issuedAt", "expiresAt", "defaultLanguage", "requiresAtp", "policyPacks", "disclosures") })
		val authority = BundledPolicyAuthority(value.getValue("endpoint").jsonPrimitive.content,
			value.getValue("issuedAt").jsonPrimitive.long, value.getValue("expiresAt").jsonPrimitive.long,
			value.getValue("manifestRevision").jsonPrimitive.also { require(it.isString) }.content, value["requiresAtp"]?.jsonPrimitive?.boolean == true)
		require(authority.manifestRevision.isNotEmpty() && authority.isUsable(endpoint, now))
		val packs = value.getValue("policyPacks").jsonArray.map { it.jsonObject }
		require(packs.isNotEmpty())
		packs.forEach { require(StrictPolicyReader.read(it["policyResolution"]) is PolicyRead.Matched) }
		val unknown = match(packs, null, null) ?: error("Unknown geography requires an authored opt-in default")
		val conservative = (StrictPolicyReader.read(packs[unknown.first]["policyResolution"]) as PolicyRead.Matched).policy
		require(conservative.model in listOf(ConsentModel.OPT_IN, ConsentModel.IAB) && conservative.prompt == PolicyPrompt.CHOICE && packs[unknown.first].getValue("policyResolution").jsonObject.getValue("policy").jsonObject.getValue("preselectedCategories").jsonArray.isEmpty())
		// An unmatched location gets the backend's own outcome, not silence: `no-match` runs
		// the safe fallback, and `insufficient-inputs` stays pending.
		val selected = matchOutcome(packs, overrides.country, overrides.region)
		val pack = (selected as? MatchOutcome.Matched)?.let { packs[it.index] }
		val wire = if (selected is MatchOutcome.Matched) JsonObject(pack!!.getValue("policyResolution").jsonObject + ("matchedBy" to JsonPrimitive(selected.matchedBy)))
			else unmatchedWire(selected)
		val fallback = value.getValue("defaultLanguage").jsonPrimitive.content
		val language = overrides.language?.lowercase()?.substringBefore('-') ?: fallback
		val copy = pack?.getValue("translations")?.jsonObject?.let { it[language] ?: it.getValue(fallback) }
		val disclosures = value["disclosures"]?.jsonObject
		val gvl = disclosures?.get("gvl")?.jsonObject
		val atp = disclosures?.get("atp")?.jsonObject
		val body = buildJsonObject {
			put("policyResolution", wire)
			copy?.let { put("translations", it) }
			put("location", buildJsonObject { put("countryCode", overrides.country?.let(::JsonPrimitive) ?: JsonNull); put("regionCode", overrides.region?.let(::JsonPrimitive) ?: JsonNull) })
			gvl?.get("data")?.let { put("gvl", it) }
			atp?.get("providers")?.let { put("adTechProviders", it) }
		}
		val mapped = InitMapper.map(TransportOutcome.Success(body, emptyMap()))
		require(!mapped.policyPending)
		Selection(authority, mapped, gvl?.get("fetchedAt")?.jsonPrimitive?.longOrNull?.takeIf { it in 0..authority.issuedAt }, atp?.get("fetchedAt")?.jsonPrimitive?.longOrNull?.takeIf { it in 0..authority.issuedAt })
	} catch (_: Exception) { null }

	/** What `matchPolicyRules` in `@c15t/schema` answers for a location. */
	internal sealed interface MatchOutcome {
		data class Matched(val index: Int, val matchedBy: String) : MatchOutcome

		/** A known location no rule covers. The core runs the safe fallback. */
		data object NoMatch : MatchOutcome

		/** The location needs a region, or is unknown with no rule for it. Stays pending. */
		data object InsufficientInputs : MatchOutcome
	}

	// Same precedence and outcomes as schema matchPolicyRules. Language never enters it.
	internal fun matchOutcome(packs: List<JsonObject>, country: String?, region: String?): MatchOutcome {
		fun countryCode(value: String?) = value?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
		fun regionCode(value: String?) = countryCode(value?.substringAfterLast('-'))
		val c = countryCode(country); val r = regionCode(region)
		fun first(predicate: (JsonObject) -> Boolean) = packs.indexOfFirst { predicate(it.getValue("match").jsonObject) }.takeIf { it >= 0 }
		fun includes(m: JsonObject, key: String) = m[key]?.jsonArray?.any { countryCode(it.jsonPrimitive.content) == c } == true
		val fallback = first { it["fallback"]?.jsonPrimitive?.booleanOrNull == true }
		if (c != null) {
			if (r != null) first { m -> m["regions"]?.jsonArray?.any { countryCode(it.jsonObject["country"]?.jsonPrimitive?.content) == c && regionCode(it.jsonObject["region"]?.jsonPrimitive?.content) == r } == true }?.let { return MatchOutcome.Matched(it, "region") }
			first { includes(it, "countries") }?.let { return MatchOutcome.Matched(it, "country") }
			if (r == null) {
				first { includes(it, "regionFallbacks") }?.let { return MatchOutcome.Matched(it, "fallback") }
				if (first { m -> m["regions"]?.jsonArray?.any { countryCode(it.jsonObject["country"]?.jsonPrimitive?.content) == c } == true } != null)
					return fallback?.let { MatchOutcome.Matched(it, "fallback") } ?: MatchOutcome.InsufficientInputs
			}
		} else if (fallback != null) return MatchOutcome.Matched(fallback, "fallback")
		first { it["isDefault"]?.jsonPrimitive?.booleanOrNull == true }?.let { return MatchOutcome.Matched(it, "default") }
		return if (c == null) MatchOutcome.InsufficientInputs else MatchOutcome.NoMatch
	}

	internal fun match(packs: List<JsonObject>, country: String?, region: String?): Pair<Int, String>? =
		(matchOutcome(packs, country, region) as? MatchOutcome.Matched)?.let { it.index to it.matchedBy }

	/** The wire `writePolicyResolutionWire` produces for an unmatched outcome. */
	internal fun unmatchedWire(outcome: MatchOutcome): JsonObject = buildJsonObject {
		put("policy", JsonNull)
		if (outcome is MatchOutcome.InsufficientInputs) {
			put("reason", "insufficient-inputs")
			put("status", "failed")
		} else put("status", "no-match")
		put("version", 1)
	}
}
