package com.inth.core.transport

import com.inth.core.model.ConsentCategory
import com.inth.core.model.SavePayload
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Builds the `POST /v1/consent/records` body, as the `save-body-*` fixtures in
 * `packages/native-protocol` pin it (CONTRACT.md, "Saving").
 *
 * The act travels in two parts:
 *
 * - `answer.categories` holds every receipt the subject has after the act, each with the
 *   time and the policy basis it was confirmed under. It is never the effective
 *   permissions: a GPC mask or a strict scope can deny a category the subject granted,
 *   and recording the masked value would rewrite what the subject chose. `necessary` is
 *   left out.
 * - `confirmed` names the categories this act confirmed, in canonical order. It is empty
 *   for an acknowledgement.
 *
 * The body never carries an identity token: queued bytes are written to disk and may be
 * replayed long after a token expires.
 */
object SaveBodyBuilder {
	/**
	 * @param payload the queued action.
	 * @param property the property field, resolved by the caller.
	 */
	fun build(
		payload: SavePayload,
		property: String,
	): JsonObject = buildJsonObject {
		payload.idempotencyKey?.let { put("idempotencyKey", it) }
		put("subjectId", payload.subjectId)
		put("property", property)
		// The action time captured once by the core; a queued replay reuses it.
		put("givenAt", payload.givenAt)
		put("consentAction", payload.consentAction.wireName)
		put("model", payload.model.wireName)
		payload.uiSource?.let { put("uiSource", it.wireName) }
		payload.policySnapshotToken?.let { put("policySnapshotToken", it) }
		payload.user?.externalId?.let { put("externalId", it) }
		payload.user?.identityProvider?.let { put("identityProvider", it) }
		payload.user?.properties?.takeIf { it.isNotEmpty() }?.let { props ->
			putJsonObject("metadata") {
				putJsonObject("userProperties") {
					for ((key, value) in props) {
						put(key, value)
					}
				}
			}
		}
		put("answer", answer(payload))
		put("confirmed", confirmed(payload))
		payload.tcString?.let {
			put("tcString", it)
			payload.addtlConsent?.let { ac -> put("addtlConsent", ac) }
		}
		// The decision assertion goes on flat, not nested, and only when nothing
		// else already binds the write to a policy revision: a `policySnapshotToken` is
		// the stronger claim.
		for ((field, value) in decisionAssertion(payload)) {
			put(field, value)
		}
	}

	/** Every receipt in the complete choice after the act, `necessary` left out. */
	private fun answer(payload: SavePayload): JsonObject {
		val categories = LinkedHashMap<String, JsonElement>()
		val choice = payload.choice
		if (choice != null) {
			for (category in ConsentCategory.OPTIONAL.map { it.wireName }.sorted()) {
				val value = choice.consents[category] ?: continue
				categories[category] = buildJsonObject {
					put("basis", basis(choice.fingerprint))
					put("confirmedAt", choice.actionAt)
					put("value", value)
				}
			}
		}
		return buildJsonObject { put("categories", JsonObject(categories)) }
	}

	/**
	 * The categories this act confirmed that hold a receipt, in the web transport's order:
	 * functionality, experience, measurement, marketing.
	 */
	private fun confirmed(payload: SavePayload): JsonArray {
		val receipts = payload.choice?.consents ?: return JsonArray(emptyList())
		return JsonArray(
			CONFIRMED_ORDER
				.filter { it in payload.confirmed.categories && receipts.containsKey(it) }
				.map(::JsonPrimitive),
		)
	}

	private val CONFIRMED_ORDER = listOf(
		ConsentCategory.FUNCTIONALITY,
		ConsentCategory.EXPERIENCE,
		ConsentCategory.MEASUREMENT,
		ConsentCategory.MARKETING,
	).map { it.wireName }

	/**
	 * The policy basis a receipt was confirmed under: `choice-v1` with the choice-prompt
	 * fingerprint, or `legacy-v2` for a receipt confirmed with none, as the snapshot
	 * writes it.
	 */
	private fun basis(fingerprint: String?): JsonObject = buildJsonObject {
		if (fingerprint.isNullOrEmpty()) {
			put("kind", "legacy-v2")
		} else {
			put("fingerprint", fingerprint)
			put("kind", "choice-v1")
		}
	}

	/**
	 * The flat `policyId`/`fingerprint`/`country`/`region`/`language`/`gpc` claim a
	 * tokenless write carries, or an empty map when it must not be sent.
	 *
	 * Port of `buildDecisionAssertion`. A token already pins the write to a policy
	 * revision, so the claim adds nothing beside it. A null `policyId` says "nothing
	 * matched", which is a complete claim by itself; a non-null one has to bring the
	 * fingerprint it vouches for. `gpc` belongs in here with the rest: the backend
	 * recomputes the decision from these fields, and a save that dropped it reads as
	 * a decision made against a stale policy.
	 */
	private fun decisionAssertion(payload: SavePayload): Map<String, JsonElement> {
		val inputs = payload.decisionInputs ?: return emptyMap()
		if (payload.policySnapshotToken != null) {
			return emptyMap()
		}
		val policyId = inputs.policyId
		if (policyId != null && (policyId.isBlank() || inputs.fingerprint == null)) {
			return emptyMap()
		}
		return linkedMapOf(
			"policyId" to (policyId?.let(::JsonPrimitive) ?: JsonNull),
			"fingerprint" to (inputs.fingerprint?.let(::JsonPrimitive) ?: JsonNull),
			"country" to (inputs.country?.let(::JsonPrimitive) ?: JsonNull),
			"region" to (inputs.region?.let(::JsonPrimitive) ?: JsonNull),
			"language" to JsonPrimitive(inputs.language),
			"gpc" to JsonPrimitive(inputs.gpc),
		)
	}
}
