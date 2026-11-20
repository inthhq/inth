package com.inth.core.model

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
	/**
	 * The lowercase UUID made once for this action and frozen into the body, so every
	 * replay sends the same key and the backend records the action once. `null` only on an
	 * entry a build from before `/v1` queued.
	 */
	val idempotencyKey: String? = null,
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
	// A legacy category payload has no frozen property. Do not invent one for an
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
		val receipts = (wire["answer"] as? JsonObject)?.get("categories") as? JsonObject ?: return false
		val ac = (wire["addtlConsent"] as? JsonPrimitive)?.contentOrNull
		if (ac != null && !ac.startsWith("2~~dv.")) return false
		if (ConsentCategory.OPTIONAL.any { category ->
				((receipts[category.wireName] as? JsonObject)?.get("value") as? JsonPrimitive)?.booleanOrNull == true
			}) return false
	}
	val encoded = payload.tcString ?: return payload.consentAction == ConsentAction.NECESSARY ||
		payload.confirmed.categories.let { it.isNotEmpty() && it.values.none { granted -> granted } }
	val tc = runCatching { com.inth.core.tc.TcStringDecoder.decode(encoded) }.getOrNull() ?: return false
	val c = tc.core
	val p = tc.publisher
	return c.purposeConsents.isEmpty() && c.purposeLegitimateInterests.isEmpty() &&
		c.vendorConsents.ids.isEmpty() && c.vendorLegitimateInterests.ids.isEmpty() && c.specialFeatureOptins.isEmpty() &&
		(p == null || p.publisherConsents.isEmpty() && p.publisherLegitimateInterests.isEmpty() &&
			p.publisherCustomConsents.isEmpty() && p.publisherCustomLegitimateInterests.isEmpty())
}

/**
 * Exact owner of an already frozen delivery obligation: the same subject, external id and
 * property. A subject id the other entry's subject replaced counts as the same subject.
 */
/**
 * Whether this entry's answer names every category [older]'s does, so replacing [older]
 * with it loses no receipt the backend has not seen. A later answer can name fewer, as
 * when a new policy fingerprint leaves the earlier receipts out of the choice.
 */
internal fun QueuedSave.covers(older: QueuedSave): Boolean {
	fun categories(entry: QueuedSave): Set<String>? = entry.body
		?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() }
		?.let { ((it["answer"] as? JsonObject)?.get("categories") as? JsonObject)?.keys }
	val mine = categories(this) ?: return false
	val theirs = categories(older) ?: return false
	return mine.containsAll(theirs)
}

internal fun QueuedSave.sameOwner(other: QueuedSave): Boolean {
	val left = body?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return false
	val right = other.body?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return false
	fun value(wire: JsonObject, key: String) = (wire[key] as? JsonPrimitive)?.contentOrNull
	val leftSubject = value(left, "subjectId") ?: return false
	if (value(left, "property") == null) return false
	val rightSubject = value(right, "subjectId")
	val sameSubject = leftSubject == rightSubject ||
		payload.subject.owns(rightSubject) || other.payload.subject.owns(leftSubject)
	return sameSubject && listOf("externalId", "property").all { value(left, it) == value(right, it) }
}
