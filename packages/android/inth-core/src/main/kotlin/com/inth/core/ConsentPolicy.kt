package com.inth.core

import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentModel
import com.inth.core.model.KernelOverrides
import com.inth.core.policy.PolicyPrompt
import com.inth.core.policy.PolicyRead
import com.inth.core.policy.ScopeMode
import com.inth.core.policy.StrictPolicyReader
import com.inth.core.transport.InitMapper
import com.inth.core.transport.MappedInit
import com.inth.core.transport.TransportOutcome
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

/**
 * How long a choice and a notice dismissal stay valid, in days. Defaults to 365.
 *
 * Fractional days are allowed, as on the backend, and round to whole milliseconds.
 */
data class PolicyValidity(val choiceDays: Double? = null, val noticeDays: Double? = null)

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
 * A policy kept in source control, resolved on the device.
 *
 * Pass it as `NativeConfig.policy`. The core then never calls `/init`, so the device has
 * no geolocation and the `fallback` rule applies unless the app sets
 * `NativeConfig.overrides` country and region itself. Records still go to
 * `NativeConfig.backendUrl`, or are dropped under `dryRun`.
 *
 * Rules are checked with the backend's authoring rules (`inspectPolicyRules` in
 * `@inth/sdk-schema`), plus three in-code limits: no `iab` model, a rule for an unknown
 * location, and a validity of at least one millisecond.
 *
 * @throws IllegalArgumentException when the policy breaks any of those rules.
 */
class ConsentPolicy(val rules: List<PolicyRule>) {
	private val packs: List<JsonObject>

	init {
		require(rules.isNotEmpty()) { "ConsentPolicy needs at least one rule" }
		rules.forEach(::validate)
		val ids = rules.map { it.id.trim() }
		ids.groupBy { it }.filterValues { it.size > 1 }.keys.firstOrNull()?.let {
			throw IllegalArgumentException("ConsentPolicy rule ids must be unique; '$it' repeats")
		}
		require(rules.count { it.match.isDefault } <= 1) { "ConsentPolicy allows only one isDefault rule" }
		require(rules.count { it.match.fallback } <= 1) { "ConsentPolicy allows only one fallback rule" }
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

	/** The backend's outcome for a location. */
	internal fun outcome(country: String?, region: String?) = BundledPolicy.matchOutcome(packs, country, region)

	/**
	 * The rule for [overrides]' country and region, as an `/init` answer. A location no
	 * rule covers gets the backend's `no-match` or `insufficient-inputs` outcome, never
	 * silence, so the core does not keep an earlier rule in force by default.
	 */
	internal fun resolve(overrides: KernelOverrides): MappedInit {
		val wire = when (val outcome = BundledPolicy.matchOutcome(packs, overrides.country, overrides.region)) {
			is BundledPolicy.MatchOutcome.Matched ->
				JsonObject(packs[outcome.index].getValue("policyResolution").jsonObject + ("matchedBy" to JsonPrimitive(outcome.matchedBy)))
			else -> BundledPolicy.unmatchedWire(outcome)
		}
		val body = buildJsonObject {
			put("policyResolution", wire)
			put("location", buildJsonObject {
				put("countryCode", overrides.country?.let(::JsonPrimitive) ?: JsonNull)
				put("regionCode", overrides.region?.let(::JsonPrimitive) ?: JsonNull)
			})
		}
		return InitMapper.map(TransportOutcome.Success(body, emptyMap())).let { mapped ->
			mapped.copy(
				isFinal = true,
				error = mapped.error?.copy(message = "The in-code policy cannot answer this location without a region; optional consent stays denied"),
			)
		}
	}

	override fun equals(other: Any?) = other is ConsentPolicy && other.rules == rules
	override fun hashCode() = rules.hashCode()

	companion object {
		private const val DAY_MS = 86_400_000L
		private const val DEFAULT_VALIDITY_DAYS = 365.0
		/** `Number.MAX_SAFE_INTEGER`, the backend's ceiling for a validity in milliseconds. */
		private const val MAX_SAFE_MS = 9_007_199_254_740_991.0

		/**
		 * Read rules written in the backend's JSON shape: `{"rules": [...]}` or a bare
		 * array. `review` is ignored, as the backend never hashes it.
		 *
		 * @throws IllegalArgumentException for anything the backend would refuse, and for
		 *   the fields an in-code policy does not support.
		 */
		fun fromJson(json: String): ConsentPolicy {
			val list = try {
				val root = Json.parseToJsonElement(json)
				(root as? JsonArray) ?: root.jsonObject.also {
					require(it.keys == setOf("rules")) { "A policy file holds only \"rules\"" }
				}.getValue("rules").jsonArray
			} catch (error: IllegalArgumentException) {
				throw IllegalArgumentException("The policy file is not { \"rules\": [...] }: ${error.message}", error)
			}
			return ConsentPolicy(list.mapIndexed { index, element -> JsonRuleReader(element, index).read() })
		}

		private fun array(values: List<String>) = JsonArray(values.map(::JsonPrimitive))

		private fun optionalNames(values: Iterable<ConsentCategory>) =
			values.filter { it != ConsentCategory.NECESSARY }.map { it.wireName }.distinct().sorted()

		private fun scopeOf(rule: PolicyRule): List<String> =
			optionalNames(rule.categories ?: ConsentCategory.OPTIONAL).ifEmpty { optionalNames(ConsentCategory.OPTIONAL) }

		private fun millis(days: Double?): Long = Math.round((days ?: DEFAULT_VALIDITY_DAYS) * DAY_MS)

		/** The authoring rules `inspectPolicyRules` in `@inth/sdk-schema` checks, plus the in-code limits. */
		private fun validate(rule: PolicyRule) {
			val label = "Policy '${rule.id}'"
			require(rule.id.isNotBlank()) { "ConsentPolicy rule ids must not be blank" }
			require(rule.model != ConsentModel.IAB) { "$label: the iab model needs a backend to serve the Global Vendor List" }
			val prompts = when (rule.model) {
				ConsentModel.OPT_IN, ConsentModel.IAB -> setOf(PolicyPrompt.CHOICE)
				ConsentModel.OPT_OUT -> PolicyPrompt.entries.toSet()
				ConsentModel.NONE -> setOf(PolicyPrompt.NONE)
			}
			require(rule.prompt in prompts) { "$label: the ${rule.model.wireName} model cannot use a ${rule.prompt.wireName} prompt" }
			rule.actions?.let { actions ->
				require(rule.prompt == PolicyPrompt.CHOICE) { "$label: actions belong to a choice prompt" }
				require(PolicyChoiceAction.ACCEPT in actions && PolicyChoiceAction.REJECT in actions) {
					"$label: actions must include accept and reject"
				}
			}
			val match = rule.match
			require(match.isDefault || match.fallback || match.countries.isNotEmpty() || match.regions.isNotEmpty() || match.regionFallbacks.isNotEmpty()) {
				"$label has no matcher. Add countries or regions, or set fallback or isDefault"
			}
			require((match.countries + match.regionFallbacks).all { it.isNotBlank() } &&
				match.regions.all { it.country.isNotBlank() && it.region.isNotBlank() }) {
				"$label: match countries and regions must be non-empty codes"
			}
			listOfNotNull(rule.validity?.choiceDays, rule.validity?.noticeDays).forEach { days ->
				require(days.isFinite() && days > 0 && days * DAY_MS <= MAX_SAFE_MS) {
					"$label: validity must be a finite number of days greater than zero"
				}
				require(Math.round(days * DAY_MS) >= 1) { "$label: validity must be at least one millisecond" }
			}
			val partial = optionalNames(rule.categories ?: emptyList())
			require(partial.isEmpty() || partial.size == ConsentCategory.OPTIONAL.size || rule.scopeMode != null) {
				"$label: a partial category scope needs a scopeMode"
			}
			val scope = scopeOf(rule).toSet()
			val preselected = optionalNames(rule.preselectedCategories)
			require(rule.preselectedCategories.isEmpty() || rule.model != ConsentModel.NONE) { "$label: the none model preselects nothing" }
			require(preselected.all { it in scope }) { "$label: preselectedCategories must be inside categories" }
			val deny = rule.privacySignals?.gpc?.denyCategories.orEmpty()
			require(ConsentCategory.NECESSARY !in deny) { "$label: privacySignals.gpc cannot deny necessary" }
			require(deny.size == deny.toSet().size) { "$label: privacySignals.gpc.denyCategories repeats a category" }
			require(optionalNames(deny).all { it in scope }) { "$label: privacySignals.gpc.denyCategories must be inside categories" }
		}

		private fun matchJson(match: PolicyMatch) = buildJsonObject {
			if (match.countries.isNotEmpty()) put("countries", array(match.countries))
			if (match.regions.isNotEmpty()) put("regions", JsonArray(match.regions.map {
				buildJsonObject { put("country", it.country); put("region", it.region) }
			}))
			if (match.regionFallbacks.isNotEmpty()) put("regionFallbacks", array(match.regionFallbacks))
			if (match.fallback) put("fallback", true)
			if (match.isDefault) put("isDefault", true)
		}

		/** The canonical rule `normalizePolicyRule` in `@inth/sdk-schema` produces, as a matched wire. */
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
			val preselected = if (rule.model == ConsentModel.NONE) emptyList() else optionalNames(rule.preselectedCategories)
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
					put("gpc", buildJsonObject { put("denyCategories", array(optionalNames(rule.privacySignals?.gpc?.denyCategories.orEmpty()))) })
				})
				put("prompt", rule.prompt.wireName)
				put("proof", buildJsonObject { put("storeIp", false); put("storeLanguage", false); put("storeUserAgent", false) })
				put("rights", array(rights))
				put("scope", array(scopeOf(rule)))
				put("scopeMode", (rule.scopeMode ?: ScopeMode.PERMISSIVE).wireName)
				put("validity", buildJsonObject {
					put("choiceMs", millis(rule.validity?.choiceDays))
					put("noticeMs", millis(rule.validity?.noticeDays))
				})
			}
		}

		/**
		 * The inputs `policyFingerprintInput`, `choicePromptFingerprintInput` and
		 * `noticePromptFingerprintInput` in `@inth/sdk-schema` hash. The choice prompt hashes
		 * only the choice validity and the notice prompt only the notice validity, so a
		 * change to one never asks again for the other.
		 */
		internal fun fingerprintInputs(rule: PolicyRule): Map<String, JsonObject> {
			val policy = normalize(rule)
			val validity = policy.getValue("validity").jsonObject
			fun prompt(domain: String, validityMs: JsonElement) = buildJsonObject {
				put("copyRevision", policy.getValue("copyRevision"))
				put("domain", domain)
				put("model", policy.getValue("model"))
				put("privacySignals", policy.getValue("privacySignals"))
				put("prompt", policy.getValue("prompt"))
				put("requiredActions", policy.getValue("actions").jsonObject.getValue("required"))
				put("rights", policy.getValue("rights"))
				put("scope", policy.getValue("scope"))
				put("scopeMode", policy.getValue("scopeMode"))
				put("validityMs", validityMs)
				put("version", 1)
			}
			return mapOf(
				"choice" to prompt("choice", validity.getValue("choiceMs")),
				"notice" to prompt("notice", validity.getValue("noticeMs")),
				"policy" to buildJsonObject {
					put("actions", policy.getValue("actions"))
					put("copyRevision", policy.getValue("copyRevision"))
					put("domain", "policy")
					put("model", policy.getValue("model"))
					put("preselectedCategories", policy.getValue("preselectedCategories"))
					put("privacySignals", policy.getValue("privacySignals"))
					put("prompt", policy.getValue("prompt"))
					put("proof", policy.getValue("proof"))
					put("rights", policy.getValue("rights"))
					put("scope", policy.getValue("scope"))
					put("scopeMode", policy.getValue("scopeMode"))
					put("validity", validity)
					put("version", 1)
				},
			)
		}

		/**
		 * The rule as a matched wire. Fingerprints hash the backend's fingerprint inputs on
		 * the device, so the encoding stays local.
		 */
		private fun wire(rule: PolicyRule): JsonObject {
			val inputs = fingerprintInputs(rule)
			return buildJsonObject {
				put("fingerprints", buildJsonObject {
					put("choice", sha256(inputs.getValue("choice").toString()))
					put("notice", sha256(inputs.getValue("notice").toString()))
					put("policy", sha256(inputs.getValue("policy").toString()))
				})
				put("matchedBy", "default")
				put("policy", normalize(rule))
				put("policyId", rule.id.trim())
				put("status", "matched")
				put("version", 1)
			}
		}

		private fun sha256(value: String) =
			MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
	}
}

/**
 * Reads one rule in the backend's JSON shape, refusing every field and value
 * `inspectPolicyRules` in `@inth/sdk-schema` refuses rather than guessing.
 */
private class JsonRuleReader(element: JsonElement, index: Int) {
	private val value = element as? JsonObject ?: fail("Policy at index $index must be an object")
	private val id = (value["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content
		?: fail("Policy at index $index is missing a non-empty id")
	private val label = "Policy '$id'"

	private fun fail(message: String): Nothing = throw IllegalArgumentException(message)

	private fun keys(obj: JsonObject, allowed: Set<String>, where: String) {
		(obj.keys - allowed).firstOrNull()?.let { fail("$label: $where has unsupported field '$it'") }
	}

	private fun string(element: JsonElement?, where: String): String =
		(element as? JsonPrimitive)?.takeIf { it.isString }?.content ?: fail("$label: $where must be a string")

	private fun strings(element: JsonElement?, where: String): List<String> =
		(element as? JsonArray ?: fail("$label: $where must be a list of strings")).map { string(it, where) }

	private fun obj(element: JsonElement?, where: String): JsonObject = element as? JsonObject ?: fail("$label: $where must be an object")

	private fun boolean(element: JsonElement?, where: String): Boolean =
		element?.let { (it as? JsonPrimitive)?.takeIf { p -> !p.isString }?.booleanOrNull ?: fail("$label: $where must be true or false") } ?: false

	private fun categories(element: JsonElement?, where: String): List<ConsentCategory> = strings(element, where).map { raw ->
		val name = raw.trim()
		ConsentCategory.fromWireName(name) ?: fail("$label: $where has unknown category '$name'")
	}

	/** `gpc.denyCategories` takes exact names: the backend neither trims nor allows a wildcard there. */
	private fun exactCategories(element: JsonElement?, where: String): List<ConsentCategory> = strings(element, where).map { name ->
		ConsentCategory.fromWireName(name) ?: fail("$label: $where has unknown category '$name'")
	}

	/** `review` is documentation only, but the backend checks its shape, so this does too. */
	private fun review(element: JsonElement) {
		val review = obj(element, "review")
		keys(review, REVIEW_KEYS, "review")
		val status = (review["status"] as? JsonPrimitive)?.takeIf { it.isString }?.content
		if (status != "pending" && status != "reviewed") fail("$label: review.status must be pending or reviewed")
		review["reviewedOn"]?.let { string(it, "review.reviewedOn") }
		review["reviewBy"]?.let { string(it, "review.reviewBy") }
		review["sources"]?.let { strings(it, "review.sources") }
		review["assumptions"]?.let { strings(it, "review.assumptions") }
	}

	private fun days(element: JsonElement?, where: String): Double? = element?.let {
		(it as? JsonPrimitive)?.takeIf { p -> !p.isString }?.doubleOrNull ?: fail("$label: $where must be a number of days")
	}

	fun read(): PolicyRule {
		keys(value, RULE_KEYS, "the rule")
		value["review"]?.let(::review)
		val match = obj(value["match"], "match")
		keys(match, MATCH_KEYS, "match")
		val scope = value["categories"]?.let { strings(it, "categories") }
		val validity = value["validity"]?.let { obj(it, "validity") }?.also { keys(it, VALIDITY_KEYS, "validity") }
		val signals = value["privacySignals"]?.let { obj(it, "privacySignals") }?.also { keys(it, setOf("gpc"), "privacySignals") }
		val gpc = signals?.get("gpc")?.let { obj(it, "privacySignals.gpc") }?.also { keys(it, setOf("denyCategories"), "privacySignals.gpc") }
		return PolicyRule(
			id = id,
			match = PolicyMatch(
				countries = match["countries"]?.let { strings(it, "match.countries") } ?: emptyList(),
				regions = match["regions"]?.let { regions ->
					(regions as? JsonArray ?: fail("$label: match.regions must be a list")).map { entry ->
						val region = obj(entry, "match.regions[]")
						keys(region, setOf("country", "region"), "match.regions[]")
						PolicyRegion(string(region["country"], "match.regions[].country"), string(region["region"], "match.regions[].region"))
					}
				} ?: emptyList(),
				regionFallbacks = match["regionFallbacks"]?.let { strings(it, "match.regionFallbacks") } ?: emptyList(),
				fallback = boolean(match["fallback"], "match.fallback"),
				isDefault = boolean(match["isDefault"], "match.isDefault"),
			),
			model = ConsentModel.fromWireName(string(value["model"], "model"))?.also { model ->
				// The backend refuses the field itself, even empty, under a model that preselects nothing.
				if (model == ConsentModel.NONE && "preselectedCategories" in value) fail("$label: the none model takes no preselectedCategories")
			} ?: fail("$label: unknown model"),
			prompt = PolicyPrompt.fromWireName(string(value["prompt"], "prompt")) ?: fail("$label: unknown prompt"),
			// Every entry beside a wildcard is still checked, as on the backend.
			categories = scope?.let {
				val named = categories(JsonArray(it.filter { name -> name.trim() != "*" }.map(::JsonPrimitive)), "categories")
				if (it.any { name -> name.trim() == "*" }) null else named
			},
			scopeMode = value["scopeMode"]?.let { ScopeMode.fromWireName(string(it, "scopeMode")) ?: fail("$label: unknown scopeMode") },
			preselectedCategories = value["preselectedCategories"]?.let { categories(it, "preselectedCategories") } ?: emptyList(),
			actions = value["actions"]?.let { list ->
				strings(list, "actions").map { PolicyChoiceAction.fromWireName(it) ?: fail("$label: unknown action '$it'") }
			},
			validity = validity?.let { PolicyValidity(days(it["choiceDays"], "validity.choiceDays"), days(it["noticeDays"], "validity.noticeDays")) },
			privacySignals = signals?.let { PolicyPrivacySignals(gpc?.let { PolicyGpc(exactCategories(it["denyCategories"], "privacySignals.gpc.denyCategories")) }) },
			copyRevision = value["copyRevision"]?.let { string(it, "copyRevision") },
		)
	}

	private companion object {
		val RULE_KEYS = setOf(
			"id", "match", "model", "prompt", "categories", "scopeMode", "preselectedCategories",
			"actions", "validity", "privacySignals", "copyRevision", "review",
		)
		val MATCH_KEYS = setOf("countries", "regions", "regionFallbacks", "fallback", "isDefault")
		val VALIDITY_KEYS = setOf("choiceDays", "noticeDays")
		val REVIEW_KEYS = setOf("status", "reviewedOn", "reviewBy", "sources", "assumptions")
	}
}
