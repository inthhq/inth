package com.c15t.core.model

import kotlinx.serialization.json.*

import kotlinx.serialization.Serializable

/**
 * The unit of a consent write, built once per explicit action.
 *
 * Mirrors `SavePayload` in `packages/sdk/core/src/types.ts`. It is persisted before
 * the request goes out and replayed unchanged on every retry, so a later init
 * that changes the policy never rewrites a queued payload: the receipts, the
 * captured action time, and the decision inputs all stay as the subject left
 * them.
 */
@Serializable
data class SavePayload(
	val subjectId: String,
	val subject: ConsentSubject,
	/** Receipt snapshot for this action. */
	val choice: ExplicitChoice?,
	/** Exactly the categories this action confirmed. */
	val confirmed: ConfirmedCoverage,
	/** Effective permissions after the action. */
	val consents: ConsentState,
	val overrides: KernelOverrides,
	val user: KernelUser?,
	val model: ConsentModel,
	val uiSource: ActiveUI?,
	val consentAction: ConsentAction,
	val policySnapshotToken: String?,
	/** Policy inputs captured with the action; the backend recomputes them. */
	val decisionInputs: DecisionInputs? = null,
	/** Equals `confirmed.actionAt`, for backends that read one time. */
	val givenAt: Long,
	val tcString: String? = null,
    val addtlConsent: String? = null,
)

/**
 * One entry in the offline write queue.
 *
 * The wrapper exists so a delivered entry can be removed by [id] without
 * comparing payloads field by field, and so the queued-at time is available for
 * logging without touching the wire payload.
 */
@Serializable
data class QueuedSave(
	val id: String,
	val queuedAt: Long,
	val payload: SavePayload,
	/**
	 * Sends of these exact bytes that the backend did not accept.
	 *
	 * Local bookkeeping only: it never reaches the wire, because the queue stores the
	 * request body inside [payload] and the body is what stays frozen. An entry written by
	 * an older build reads as zero, which is the honest reading -- nothing has been tried
	 * under this build.
	 */
	val attempts: Int = 0,
	/** Exact UTF-8 POST body captured for native IAB commits. */
	val body: String? = null,
)

/** A complete denial owes delivery even after current consent authority expires. */
internal fun QueuedSave.isWithdrawal(): Boolean {
	// A legacy category payload has no frozen domain. Do not invent one for an
	// authority-independent delivery exception.
	if (body == null && payload.tcString == null && payload.model != ConsentModel.IAB) return false
	if (ConsentCategory.OPTIONAL.any { payload.consents[it] }) return false
	if (payload.addtlConsent?.startsWith("2~~dv.") == false) return false
	val frozen = body
	if (frozen != null) {
		val wire = runCatching { Json.parseToJsonElement(frozen).jsonObject }.getOrNull() ?: return false
		if (wire["subjectId"]?.jsonPrimitive?.contentOrNull != payload.subjectId ||
			wire["givenAt"]?.jsonPrimitive?.longOrNull != payload.givenAt ||
			wire["tcString"]?.jsonPrimitive?.contentOrNull != payload.tcString ||
			wire["addtlConsent"]?.jsonPrimitive?.contentOrNull != payload.addtlConsent) return false
		val preferences = wire["preferences"] as? JsonObject ?: return false
		if ((preferences["necessary"] as? JsonPrimitive)?.booleanOrNull != true) return false
		val ac = (wire["addtlConsent"] as? JsonPrimitive)?.contentOrNull
		if (ac != null && !ac.startsWith("2~~dv.")) return false
		if (ConsentCategory.OPTIONAL.any { (preferences[it.wireName] as? JsonPrimitive)?.booleanOrNull == true }) return false
	}
	val encoded = payload.tcString ?: return payload.consentAction == ConsentAction.NECESSARY ||
		payload.confirmed.categories.let { it.isNotEmpty() && it.values.none { granted -> granted } }
	val tc = runCatching { com.c15t.core.tc.TcStringDecoder.decode(encoded) }.getOrNull() ?: return false
	val c = tc.core
	val p = tc.publisher
	return c.purposeConsents.isEmpty() && c.purposeLegitimateInterests.isEmpty() &&
		c.vendorConsents.ids.isEmpty() && c.vendorLegitimateInterests.ids.isEmpty() && c.specialFeatureOptins.isEmpty() &&
		(p == null || p.publisherConsents.isEmpty() && p.publisherLegitimateInterests.isEmpty() &&
			p.publisherCustomConsents.isEmpty() && p.publisherCustomLegitimateInterests.isEmpty())
}

/** Exact owner of an already frozen delivery obligation. */
internal fun QueuedSave.sameOwner(other: QueuedSave): Boolean {
	val left = body?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return false
	val right = other.body?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return false
	if (left["subjectId"] == null || left["domain"] == null) return false
	return listOf("subjectId", "externalSubjectId", "domain").all {
		(left[it] as? JsonPrimitive)?.contentOrNull == (right[it] as? JsonPrimitive)?.contentOrNull
	}
}
