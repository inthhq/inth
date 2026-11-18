package com.inth.core.policy

import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentModel
import com.inth.core.model.PolicyResolution
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/** Outcome of reading a `policyResolution` wire value. */
sealed class PolicyRead {
	/** A rule this build can represent. */
	data class Matched(val policy: EvaluationPolicy) : PolicyRead()

	/** A resolution the backend reported that asks for no policy. */
	data class NoPolicy(val status: String) : PolicyRead()

	/**
	 * A refusal this build can state plainly: the resolution carries `status: "failed"`
	 * with a reason. The core knows what went wrong and can represent the answer, so a
	 * device already under a policy keeps that policy through it, which is what a failed
	 * init does everywhere else.
	 */
	data class Failed(val reason: String) : PolicyRead()

	/**
	 * A value this build cannot parse: a shape it does not have, a status, version, or
	 * category name it does not know, or a resolution that is simply absent.
	 *
	 * This is contract rule 5, and the one case where the core may not keep its last
	 * answer: it must serve `policyPending: true` with every optional category denied,
	 * including one it had granted. That lands on `PENDING` and never `DENIED`, so a
	 * host keeps listening and the next parseable resolution restores the grant.
	 */
	data class Unreadable(val reason: String) : PolicyRead()
}

/**
 * Strict reader for the `policyResolution` value of an `/init` response.
 *
 * The reader never repairs, defaults, or guesses a permission. It accepts the
 * normalized `ResolvedPolicyRule` shape from `@inth/sdk-schema` and rejects everything
 * else. `iab` is part of that shape and is read -- [PolicyEvaluator] has a rule for it, and
 * each core keeps the vendor list `/init` serves. What stays refused is a model this enum
 * does not name: a value invented after this build is a producer speaking a contract this
 * reader does not have, and there is no default that could be guessed for it.
 */
object StrictPolicyReader {
	/** The `policyResolution.version` this build reads; matches `@c15t/schema`. */
	const val POLICY_CONTRACT_VERSION = 1

	/** Categories the `'*'` wildcard expands to. */
	private val ALL_OPTIONAL = ConsentCategory.OPTIONAL

	/**
	 * Read [element], the raw `policyResolution` member of an `/init` body.
	 *
	 * A `200` without a resolution, or with one this build cannot parse, is contract
	 * rule 5.
	 *
	 * @param element the raw wire value, or `null` when the member was absent.
	 */
	fun read(element: JsonElement?): PolicyRead {
		if (element == null || element is JsonNull) {
			return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		}
		val root = element as? JsonObject ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		root.stringOrNull("version")?.let { declared ->
			// The resolution's own schema version. One from a newer schema is a value this
			// build cannot read, which is rule 5.
			val version = declared.toLongOrNull() ?: return PolicyRead.Unreadable(PolicyResolution.REASON_UNSUPPORTED_CONTRACT)
			if (version != POLICY_CONTRACT_VERSION.toLong()) {
				return PolicyRead.Unreadable(PolicyResolution.REASON_UNSUPPORTED_CONTRACT)
			}
		}

		return when (val status = root.stringOrNull("status")) {
			PolicyResolution.STATUS_MATCHED -> readMatched(root)
			PolicyResolution.STATUS_NO_MATCH, PolicyResolution.STATUS_UNCONFIGURED -> PolicyRead.NoPolicy(status)
			PolicyResolution.STATUS_FAILED -> {
				val reason = root.stringOrNull("reason") ?: PolicyResolution.REASON_INVALID_PAYLOAD
				PolicyRead.Failed(reason)
			}

			null -> PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
			else -> PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		}
	}

	private fun readMatched(root: JsonObject): PolicyRead {
		val policyId = root.stringOrNull("policyId") ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		val policy = root["policy"] as? JsonObject ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		val fingerprints = root["fingerprints"] as? JsonObject
		val choiceFingerprint = fingerprints.stringOrNull("choice") ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		val policyFingerprint = fingerprints.stringOrNull("policy") ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		// `policyFingerprintsSchema` in `@inth/sdk-schema` requires all three; only
		// `legacyMaterial` is optional. A notice dismissal is judged against this one.
		val noticeFingerprint = fingerprints.stringOrNull("notice") ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		val model = ConsentModel.fromWireName(policy.stringOrNull("model"))
			// Any model this build does not name. `iab` reads; a value from a newer schema
			// does not, and contract rule 5 decides what that costs the device.
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		val prompt = PolicyPrompt.fromWireName(policy.stringOrNull("prompt"))
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		// The wire key is `scope`; `categories` is a save-body field and never appears here.
		val scope = readCategories(policy["scope"], ALL_OPTIONAL)
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		val rawScopeMode = policy.stringOrNull("scopeMode")
		val scopeMode = when {
			rawScopeMode == null && (policy["scope"] == null || policy["scope"].isWildcard()) -> ScopeMode.PERMISSIVE
			rawScopeMode == null -> return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
			else -> ScopeMode.fromWireName(rawScopeMode) ?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		}

		val validity = policy["validity"] as? JsonObject
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		val choiceMs = readDurationMs(validity, "choiceMs", "choiceDays")
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		val noticeMs = readDurationMs(validity, "noticeMs", "noticeDays")
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		val gpcDeny = readCategories(
			(policy["privacySignals"] as? JsonObject)?.let { (it["gpc"] as? JsonObject)?.get("denyCategories") },
			emptyList(),
		)
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)

		// `rights` decides whether a GPP US section applies and which notices it reports, so
		// this reads it exactly as `PolicyWireReader` in core-swift and `readStringSet` plus
		// `collectResolvedPolicyRuleIssues` in @inth/sdk-schema do, in the same order. Absent, not
		// an array, a non-string or a repeat is an invalid payload; a value this build does not
		// name is an unsupported contract; a set missing a right the model requires is an
		// invalid payload. Each fails closed rather than reporting fewer rights than the rule has.
		val rawRights = policy["rights"] as? JsonArray
			?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		val rightNames = rawRights.map { element ->
			(element as? JsonPrimitive)?.takeIf { it.isString }?.content
				?: return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		}
		if (rightNames.toSet().size != rightNames.size) {
			return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		}
		val rights = rightNames.map { name ->
			PolicyRight.fromWireName(name)
				?: return PolicyRead.Unreadable(PolicyResolution.REASON_UNSUPPORTED_CONTRACT)
		}
		if (!rights.containsAll(PolicyRight.requiredFor(model))) {
			return PolicyRead.Unreadable(PolicyResolution.REASON_INVALID_PAYLOAD)
		}

		return PolicyRead.Matched(
			EvaluationPolicy(
				id = policy.stringOrNull("id") ?: policyId,
				model = model,
				prompt = prompt,
				scope = scope,
				scopeMode = scopeMode,
				choiceMs = choiceMs,
				noticeMs = noticeMs,
				gpcDenyCategories = gpcDeny,
				choiceFingerprint = choiceFingerprint,
				policyFingerprint = policyFingerprint,
				noticeFingerprint = noticeFingerprint,
				rights = rights.sortedBy { it.wireName },
			)
		)
	}

	/**
	 * Read a category list. `null` means the member was absent, which callers
	 * decide about; a non-empty list containing an unknown name returns `null`
	 * too, because inventing a scope is exactly what rule 5 forbids.
	 */
	private fun readCategories(
		element: JsonElement?,
		absent: List<ConsentCategory>,
	): List<ConsentCategory>? {
		if (element == null || element is JsonNull) {
			return absent
		}
		val array = element as? JsonArray ?: return null
		if (array.isEmpty() || array.isWildcard()) {
			return absent
		}
		val out = ArrayList<ConsentCategory>(array.size)
		for (item in array) {
			val name = (item as? JsonPrimitive)?.contentOrNull ?: return null
			if (name == "necessary") {
				// Tolerated and dropped upstream.
				continue
			}
			val category = ConsentCategory.fromWireName(name)?.takeIf { it.optional } ?: return null
			out += category
		}
		return ALL_OPTIONAL.filter { it in out }
	}

	/** Read a millisecond duration, falling back to the day-based author form. */
	private fun readDurationMs(
		validity: JsonObject,
		millisKey: String,
		daysKey: String,
	): Long? {
		validity[millisKey]?.let { value ->
			val millis = (value as? JsonPrimitive)?.longOrNull ?: return@let
			if (millis <= 0L) {
				return null
			}
			return millis
		}
		val days = (validity[daysKey] as? JsonPrimitive)?.doubleOrNull ?: return null
		if (days <= 0.0 || days.isNaN() || days.isInfinite()) {
			return null
		}
		return Math.round(days * MILLIS_PER_DAY)
	}

	private fun JsonObject?.stringOrNull(key: String): String? {
		val value = this?.get(key) as? JsonPrimitive ?: return null
		return value.contentOrNull?.takeIf { it.isNotEmpty() }
	}

	private fun JsonElement?.isWildcard(): Boolean =
		this is JsonArray && size == 1 && (this[0] as? JsonPrimitive)?.contentOrNull == "*"

	private const val MILLIS_PER_DAY = 86_400_000L
}
