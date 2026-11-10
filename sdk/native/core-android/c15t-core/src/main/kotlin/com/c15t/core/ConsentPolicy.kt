package com.c15t.core

import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.KernelOverrides
import com.c15t.core.policy.PolicyPrompt
import com.c15t.core.policy.PolicyRead
import com.c15t.core.policy.ScopeMode
import com.c15t.core.policy.StrictPolicyReader
import com.c15t.core.transport.InitMapper
import com.c15t.core.transport.MappedInit
import com.c15t.core.transport.TransportOutcome
import java.security.MessageDigest
import kotlinx.serialization.json.*

/** Actions a choice prompt offers. `accept` and `reject` are always offered. */
enum class PolicyChoiceAction(val wireName: String) {
	ACCEPT("accept"),
	REJECT("reject"),
	CUSTOMIZE("customize"),
	;

	companion object {
		fun fromWireName(value: String?): PolicyChoiceAction? = entries.firstOrNull { it.wireName == value }
	}
}

/** A country and one of its regions, such as `CA` and `QC`. */
data class PolicyRegion(val country: String, val region: String)

/**
 * Where a rule applies, in the backend's `PolicyMatch` names.
 *
 * Precedence follows the backend: region, then country, then `regionFallbacks` for a
 * country without a region, then the `fallback` rule for an unknown location, then the
 * `isDefault` rule.
 */
data class PolicyMatch(
	val countries: List<String> = emptyList(),
	val regions: List<PolicyRegion> = emptyList(),
	val regionFallbacks: List<String> = emptyList(),
	val fallback: Boolean = false,
	val isDefault: Boolean = false,
)

/** How long a choice and a notice dismissal stay valid, in days. Defaults to 365. */
data class PolicyValidity(val choiceDays: Int? = null, val noticeDays: Int? = null)

/** Categories an active Global Privacy Control signal denies. */
data class PolicyGpc(val denyCategories: List<ConsentCategory>)

/** Privacy-signal handling, in the backend's `privacySignals` shape. */
data class PolicyPrivacySignals(val gpc: PolicyGpc? = null)

/**
 * One rule of an in-code policy, in the backend's `PolicyRule` names.
 *
 * `categories` `null` means every optional category. `scopeMode` defaults to
 * `permissive`, as on the backend. The `iab` model is refused: IAB TCF needs a backend
 * to serve the Global Vendor List.
 */
data class PolicyRule(
	val id: String,
	val match: PolicyMatch,
	val model: ConsentModel,
	val prompt: PolicyPrompt,
	val categories: List<ConsentCategory>? = null,
	val scopeMode: ScopeMode? = null,
	val preselectedCategories: List<ConsentCategory> = emptyList(),
	val actions: List<PolicyChoiceAction>? = null,
	val validity: PolicyValidity? = null,
	val privacySignals: PolicyPrivacySignals? = null,
	val copyRevision: String? = null,
)

/**
 * A policy kept in source control: the only policy source in no-backend mode.
 *
 * Pass it as `NativeConfig.policy` with no backend URL. The device has no geolocation
 * without a backend, so the `fallback` rule applies unless the app sets
 * `NativeConfig.overrides` country and region itself. Records stay on the device.
 *
 * @throws IllegalArgumentException when a rule is invalid, an id repeats, a rule uses
 *   the `iab` model, or no rule covers an unknown location.
 */
class ConsentPolicy(val rules: List<PolicyRule>) {
	private val packs: List<JsonObject>

	init {
		require(rules.isNotEmpty()) { "ConsentPolicy needs at least one rule" }
		require(rules.map { it.id.trim() }.toSet().size == rules.size) { "ConsentPolicy rule ids must be unique" }
		rules.forEach { rule ->
			require(rule.id.isNotBlank()) { "ConsentPolicy rule ids must not be blank" }
			require(rule.model != ConsentModel.IAB) {
				"Policy '${rule.id}': the iab model needs a backend to serve the Global Vendor List"
			}
			validate(rule)
		}
		packs = rules.map { rule ->
			val wire = wire(rule)
			val read = StrictPolicyReader.read(wire)
			require(read is PolicyRead.Matched) { "Policy '${rule.id}' is invalid: $read" }
			buildJsonObject { put("match", matchJson(rule.match)); put("policyResolution", wire) }
		}
		require(BundledPolicy.match(packs, null, null) != null) {
			"ConsentPolicy needs a fallback or isDefault rule for an unknown location"
		}
	}

	/** The id of the rule for a location and how it matched, as the backend reports it. */
	internal fun match(country: String?, region: String?): Pair<String, String>? =
		BundledPolicy.match(packs, country, region)?.let { (index, matchedBy) -> rules[index].id.trim() to matchedBy }

	/** The rule for [overrides]' country and region, as an `/init` answer. */
	internal fun resolve(overrides: KernelOverrides): MappedInit? {
		val (index, matchedBy) = BundledPolicy.match(packs, overrides.country, overrides.region) ?: return null
		val wire = JsonObject(packs[index].getValue("policyResolution").jsonObject + ("matchedBy" to JsonPrimitive(matchedBy)))
		val body = buildJsonObject {
			put("policyResolution", wire)
			put("location", buildJsonObject {
				put("countryCode", overrides.country?.let(::JsonPrimitive) ?: JsonNull)
				put("regionCode", overrides.region?.let(::JsonPrimitive) ?: JsonNull)
			})
		}
		return InitMapper.map(TransportOutcome.Success(body, emptyMap())).takeIf { !it.policyPending }
	}

	override fun equals(other: Any?) = other is ConsentPolicy && other.rules == rules
	override fun hashCode() = rules.hashCode()

	companion object {
		private const val DAY_MS = 86_400_000L
		private const val DEFAULT_VALIDITY_DAYS = 365

		/**
		 * Read rules written in the backend's JSON shape: `{"rules": [...]}` or a bare
		 * array. `review` is ignored, as the backend never hashes it.
		 *
		 * @throws IllegalArgumentException for an unknown or unsupported field.
		 */
		fun fromJson(json: String): ConsentPolicy {
			val root = Json.parseToJsonElement(json)
			val list = (root as? JsonArray) ?: root.jsonObject.also {
				require(it.keys == setOf("rules")) { "A policy file holds only \"rules\"" }
			}.getValue("rules").jsonArray
			return ConsentPolicy(list.map { readRule(it.jsonObject) })
		}

		private val ruleKeys = setOf(
			"id", "match", "model", "prompt", "categories", "scopeMode", "preselectedCategories",
			"actions", "validity", "privacySignals", "copyRevision", "review",
		)

		private fun readRule(value: JsonObject): PolicyRule {
			val id = value["id"]?.jsonPrimitive?.content ?: throw IllegalArgumentException("A policy rule needs an id")
			(value.keys - ruleKeys).firstOrNull()?.let { throw IllegalArgumentException("Policy '$id': unsupported field '$it'") }
			fun categories(element: JsonElement?): List<ConsentCategory>? = element?.jsonArray?.map {
				val name = it.jsonPrimitive.content.trim()
				ConsentCategory.fromWireName(name) ?: throw IllegalArgumentException("Policy '$id': unknown category '$name'")
			}
			val match = value["match"]?.jsonObject ?: throw IllegalArgumentException("Policy '$id' needs a match")
			fun strings(key: String) = match[key]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
			val categoriesValue = value["categories"]
			return PolicyRule(
				id = id,
				match = PolicyMatch(
					countries = strings("countries"),
					regions = match["regions"]?.jsonArray?.map {
						PolicyRegion(it.jsonObject.getValue("country").jsonPrimitive.content, it.jsonObject.getValue("region").jsonPrimitive.content)
					} ?: emptyList(),
					regionFallbacks = strings("regionFallbacks"),
					fallback = match["fallback"]?.jsonPrimitive?.boolean == true,
					isDefault = match["isDefault"]?.jsonPrimitive?.boolean == true,
				),
				model = ConsentModel.fromWireName(value["model"]?.jsonPrimitive?.content)
					?: throw IllegalArgumentException("Policy '$id': unknown model"),
				prompt = PolicyPrompt.fromWireName(value["prompt"]?.jsonPrimitive?.content)
					?: throw IllegalArgumentException("Policy '$id': unknown prompt"),
				categories = if (categoriesValue is JsonPrimitive && categoriesValue.content == "*") null
					else if (categoriesValue?.jsonArray?.any { it.jsonPrimitive.content.trim() == "*" } == true) null
					else categories(categoriesValue),
				scopeMode = value["scopeMode"]?.jsonPrimitive?.content?.let {
					ScopeMode.fromWireName(it) ?: throw IllegalArgumentException("Policy '$id': unknown scopeMode '$it'")
				},
				preselectedCategories = categories(value["preselectedCategories"]) ?: emptyList(),
				actions = value["actions"]?.jsonArray?.map {
					PolicyChoiceAction.fromWireName(it.jsonPrimitive.content)
						?: throw IllegalArgumentException("Policy '$id': unknown action '${it.jsonPrimitive.content}'")
				},
				validity = value["validity"]?.jsonObject?.let {
					PolicyValidity(it["choiceDays"]?.jsonPrimitive?.int, it["noticeDays"]?.jsonPrimitive?.int)
				},
				privacySignals = value["privacySignals"]?.jsonObject?.let { signals ->
					PolicyPrivacySignals(signals["gpc"]?.jsonObject?.let { PolicyGpc(categories(it["denyCategories"]) ?: emptyList()) })
				},
				copyRevision = value["copyRevision"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content,
			)
		}

		/** The authoring invariants `@c15t/schema` checks before it normalizes a rule. */
		private fun validate(rule: PolicyRule) {
			val label = "Policy '${rule.id}'"
			val prompts = when (rule.model) {
				ConsentModel.OPT_IN, ConsentModel.IAB -> setOf(PolicyPrompt.CHOICE)
				ConsentModel.OPT_OUT -> PolicyPrompt.entries.toSet()
				ConsentModel.NONE -> setOf(PolicyPrompt.NONE)
			}
			require(rule.prompt in prompts) { "$label: the ${rule.model.wireName} model cannot use a ${rule.prompt.wireName} prompt" }
			require(rule.actions == null || rule.prompt == PolicyPrompt.CHOICE) { "$label: actions belong to a choice prompt" }
			rule.validity?.let { validity ->
				require(listOfNotNull(validity.choiceDays, validity.noticeDays).all { it > 0 }) { "$label: validity days must be greater than zero" }
			}
			val scope = rule.categories?.filter { it != ConsentCategory.NECESSARY }?.takeIf { it.isNotEmpty() }
			require(scope == null || scope.toSet().size == ConsentCategory.OPTIONAL.size || rule.scopeMode != null) {
				"$label: a partial category scope needs a scopeMode"
			}
			val inScope = scope?.toSet() ?: ConsentCategory.OPTIONAL.toSet()
			require(rule.preselectedCategories.filter { it != ConsentCategory.NECESSARY }.all { it in inScope }) {
				"$label: preselectedCategories must be inside categories"
			}
			require(rule.preselectedCategories.isEmpty() || rule.model != ConsentModel.NONE) {
				"$label: the none model preselects nothing"
			}
			require(rule.privacySignals?.gpc?.denyCategories.orEmpty().filter { it != ConsentCategory.NECESSARY }.all { it in inScope }) {
				"$label: privacySignals.gpc.denyCategories must be inside categories"
			}
		}

		private fun array(values: List<String>) = JsonArray(values.map(::JsonPrimitive))

		private fun sortedNames(values: Iterable<ConsentCategory>) =
			values.filter { it != ConsentCategory.NECESSARY }.map { it.wireName }.distinct().sorted()

		private fun matchJson(match: PolicyMatch) = buildJsonObject {
			if (match.countries.isNotEmpty()) put("countries", array(match.countries))
			if (match.regions.isNotEmpty()) put("regions", JsonArray(match.regions.map {
				buildJsonObject { put("country", it.country); put("region", it.region) }
			}))
			if (match.regionFallbacks.isNotEmpty()) put("regionFallbacks", array(match.regionFallbacks))
			if (match.fallback) put("fallback", true)
			if (match.isDefault) put("isDefault", true)
		}

		/** The canonical rule `normalizePolicyRule` in `@c15t/schema` produces, as a matched wire. */
		internal fun normalize(rule: PolicyRule): JsonObject {
			val (allowed, equivalent, required) = when (rule.prompt) {
				PolicyPrompt.CHOICE -> Triple(
					((rule.actions?.map { it.wireName } ?: listOf("accept", "reject", "customize")) + listOf("accept", "reject")).distinct().sorted(),
					listOf(listOf("accept", "reject")),
					listOf("accept", "reject"),
				)
				PolicyPrompt.NOTICE -> Triple(listOf("dismiss"), emptyList(), listOf("dismiss"))
				PolicyPrompt.NONE -> Triple(emptyList(), emptyList(), emptyList())
			}
			val rights = when (rule.model) {
				ConsentModel.NONE -> emptyList()
				ConsentModel.OPT_OUT -> listOf("disclosure", "opt-out", "preferences")
				else -> listOf("disclosure", "preferences")
			}
			val scope = sortedNames(rule.categories ?: ConsentCategory.OPTIONAL).ifEmpty { sortedNames(ConsentCategory.OPTIONAL) }
			val preselected = if (rule.model == ConsentModel.NONE) emptyList() else sortedNames(rule.preselectedCategories)
			return buildJsonObject {
				put("actions", buildJsonObject {
					put("allowed", array(allowed))
					put("equivalent", JsonArray(equivalent.map(::array)))
					put("required", array(required))
				})
				put("copyRevision", rule.copyRevision?.trim()?.takeIf { it.isNotEmpty() }?.let(::JsonPrimitive) ?: JsonNull)
				put("id", rule.id.trim())
				put("model", rule.model.wireName)
				put("preselectedCategories", array(preselected))
				put("privacySignals", buildJsonObject {
					put("gpc", buildJsonObject { put("denyCategories", array(sortedNames(rule.privacySignals?.gpc?.denyCategories ?: emptyList()))) })
				})
				put("prompt", rule.prompt.wireName)
				put("proof", buildJsonObject { put("storeIp", false); put("storeLanguage", false); put("storeUserAgent", false) })
				put("rights", array(rights))
				put("scope", array(scope))
				put("scopeMode", (rule.scopeMode ?: ScopeMode.PERMISSIVE).wireName)
				put("validity", buildJsonObject {
					put("choiceMs", (rule.validity?.choiceDays ?: DEFAULT_VALIDITY_DAYS) * DAY_MS)
					put("noticeMs", (rule.validity?.noticeDays ?: DEFAULT_VALIDITY_DAYS) * DAY_MS)
				})
			}
		}

		/**
		 * The rule as a matched wire. Fingerprints hash the canonical rule on the device:
		 * they never leave it in no-backend mode, and changing the rule changes them, which
		 * asks returning people again.
		 */
		private fun wire(rule: PolicyRule): JsonObject {
			val policy = normalize(rule)
			fun hash(domain: String, vararg keys: String) = sha256(buildJsonObject {
				put("domain", domain)
				for (key in keys) put(key, policy.getValue(key))
			}.toString())
			return buildJsonObject {
				put("fingerprints", buildJsonObject {
					put("choice", hash("choice", "copyRevision", "model", "privacySignals", "prompt", "rights", "scope", "scopeMode", "validity"))
					put("notice", hash("notice", "copyRevision", "model", "privacySignals", "prompt", "rights", "scope", "scopeMode", "validity"))
					put("policy", hash("policy", *policy.keys.toTypedArray()))
				})
				put("matchedBy", "default")
				put("policy", policy)
				put("policyId", rule.id.trim())
				put("status", "matched")
				put("version", 1)
			}
		}

		private fun sha256(value: String) =
			MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
	}
}
