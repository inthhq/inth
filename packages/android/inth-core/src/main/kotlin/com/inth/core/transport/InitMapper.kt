package com.inth.core.transport

import com.inth.core.iab.*
import kotlinx.serialization.json.JsonNull
import com.inth.core.model.ConsentLocation
import com.inth.core.model.KernelError
import com.inth.core.model.KernelOverrides
import com.inth.core.model.PolicyResolution
import com.inth.core.model.PrivacySignals
import com.inth.core.policy.EvaluationPolicy
import com.inth.core.policy.PolicyRead
import com.inth.core.policy.StrictPolicyReader
import com.inth.core.tc.GlobalVendorList
import com.inth.core.tc.GlobalVendorListJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * What an `/init` response contributes to the snapshot.
 *
 * [policyPending] is decided here rather than by the caller: a definitive answer
 * (`matched`, `no-match`, `unconfigured`) clears it, while any failure leaves it
 * set so the gate keeps denying every optional category. [policyUnreadable] is the
 * one failure the caller must not soften: a resolution this build cannot parse at
 * all, which is contract rule 5 rather than a connectivity event.
 */
data class MappedInit(
	val resolution: PolicyResolution,
	val evaluationPolicy: EvaluationPolicy?,
	val policyPending: Boolean,
	/**
	 * `true` when the response carried a `policyResolution` this build cannot parse,
	 * as opposed to one it read and refused. A read-and-refused resolution is an
	 * answer, so a device already under a policy keeps it through a later failure;
	 * an unreadable one is not an answer, and the caller has to take back a grant it
	 * served from a wire it can no longer represent.
	 */
	val policyUnreadable: Boolean = false,
	/**
	 * `true` when the answer was worked out on the device, as the in-code policy is. No
	 * later `/init` will revise it, so it replaces the policy in force even when it is a
	 * failure: a device under a local policy that cannot answer a location fails closed
	 * instead of keeping the last rule's grants.
	 */
	val isFinal: Boolean = false,
	val location: ConsentLocation? = null,
	val resolvedOverrides: KernelOverrides? = null,
	/**
	 * GPC the backend resolved for this request, from `resolvedPrivacySignals.gpc`
	 * or the `Sec-GPC` header. A detection, not an override: the app's own override
	 * outranks it, and the merged value is what the evaluator honors.
	 */
	val resolvedGpcDetection: Boolean? = null,
	/** Language of the served translation bundle, one input to the resolved overrides. */
	val translationsLanguage: String? = null,
	val policySnapshotToken: String? = null,
	val translations: JsonObject? = null,
	/**
	 * The vendor list the backend embedded under `gvl`, already accepted or refused by
	 * [GlobalVendorListJson.fromInitBody].
	 *
	 * `null` covers three cases and treats them as one: the backend sent no `gvl`, because it only
	 * embeds one when the matched policy's model is `iab` (`packages/backend/src/http/init.ts`); the
	 * backend sent one and it failed the list contract, which is what the web's `fetchGVL` throws on
	 * and what the web then serves as no list; and the response was a failure at all, so there was no
	 * body to read a list out of.
	 *
	 * It is null in the third case by construction, and that costs nothing: this field never takes
	 * anything away. The kernel keeps the last list it accepted across a list-less or failed `/init`,
	 * for the reason written at [com.inth.core.ConsentCore.vendorList], so a device that has already
	 * drawn purpose names off a list keeps being able to say who they belong to. Reading this field
	 * as "install it, or clear what you have" would be the bug that comment is there to prevent.
	 *
	 * No error rides with a refused list. The list is display and encoding data, and the policy
	 * resolution answered independently of it; failing an `/init` over a vendor list would deny
	 * consent to a subject whose rule resolved fine.
	 */
	val gvl: GlobalVendorList? = null,
    val adTechProviders: List<AdTechProvider>? = null,
    val adTechProvidersInvalid: Boolean = false,
    /** `/init`'s `customVendors`, or null when the key is absent, which keeps the list held. */
    val customVendors: List<com.inth.core.iab.IabCustomVendor>? = null,
    /** A `customVendors` value that is not a readable list. The core then holds none. */
    val customVendorsInvalid: Boolean = false,
	val error: KernelError? = null,
)

/**
 * Reads a `GET /v1/consent/init` response.
 *
 * A `200` is a definitive answer: `/v1` has no contract negotiation, so no response
 * header is read, and a policy resolution this build cannot parse is contract rule 5.
 */
object InitMapper {
	/** Map [outcome], never throwing; every unparseable path yields a failure. */
	fun map(outcome: TransportOutcome): MappedInit = when (outcome) {
		is TransportOutcome.HttpFailure -> MappedInit(
			resolution = PolicyResolution.failed(PolicyResolution.REASON_TRANSPORT),
			evaluationPolicy = null,
			policyPending = true,
			error = KernelError(
				code = PolicyResolution.REASON_TRANSPORT,
				message = "Inth: /v1/consent/init responded ${outcome.describe()}",
			),
		)

		is TransportOutcome.NetworkFailure -> MappedInit(
			resolution = PolicyResolution.failed(PolicyResolution.REASON_TRANSPORT),
			evaluationPolicy = null,
			policyPending = true,
			error = KernelError(code = PolicyResolution.REASON_TRANSPORT, message = outcome.message),
		)

		is TransportOutcome.Success -> mapSuccess(outcome)
	}

	private fun mapSuccess(outcome: TransportOutcome.Success): MappedInit {
		val body = (outcome.body as? JsonObject)

		val rawResolution = body?.get("policyResolution")
		val read = StrictPolicyReader.read(rawResolution)

		val (resolution, policy) = when (read) {
			is PolicyRead.Matched -> PolicyResolution(
				status = PolicyResolution.STATUS_MATCHED,
				policyId = read.policy.id,
				fingerprint = read.policy.policyFingerprint,
			) to read.policy

			is PolicyRead.NoPolicy -> PolicyResolution(status = read.status) to null
			is PolicyRead.Failed -> PolicyResolution.failed(read.reason) to null

			// Still reported as a `failed` resolution so the host can read the reason;
			// what sets it apart from the line above is [MappedInit.policyUnreadable].
			is PolicyRead.Unreadable -> PolicyResolution.failed(read.reason) to null
		}

		val error = if (resolution.status == PolicyResolution.STATUS_FAILED) {
			KernelError(
				code = resolution.reason ?: PolicyResolution.REASON_INVALID_PAYLOAD,
				message = initFailureMessage(read, resolution.reason),
			)
		} else {
			null
		}

		return MappedInit(
			resolution = resolution,
			evaluationPolicy = policy,
			policyPending = resolution.status == PolicyResolution.STATUS_FAILED,
			policyUnreadable = read is PolicyRead.Unreadable,
			location = (body?.get("location") as? JsonObject)?.let { location ->
				ConsentLocation(
					country = location.stringOrNull("countryCode") ?: location.stringOrNull("country"),
					region = location.stringOrNull("regionCode") ?: location.stringOrNull("region"),
					language = location.stringOrNull("language"),
				)
			},
			resolvedOverrides = (body?.get("resolvedOverrides") as? JsonObject)?.let { overrides ->
				KernelOverrides(
					country = overrides.stringOrNull("country"),
					region = overrides.stringOrNull("region"),
					language = overrides.stringOrNull("language"),
					gpc = overrides["gpc"]?.let { (it as? JsonPrimitive)?.contentOrNull?.toBooleanStrictOrNull() },
				)
			},
			// The wire serves `{ gpc: true }`, which is one detection. An `msa` key is
			// not read: it does not exist in v3, and treating an unknown signal as a
			// known one is the kind of invention the contract forbids.
			resolvedGpcDetection = when (val value = (body?.get("resolvedPrivacySignals") as? JsonObject)?.get("gpc")) {
				is JsonPrimitive -> value.contentOrNull?.toBooleanStrictOrNull()
				else -> null
			},
			translationsLanguage = (body?.get("translations") as? JsonObject)?.stringOrNull("language"),
			policySnapshotToken = body.stringOrNull("policySnapshotToken"),
			translations = body?.get("translations") as? JsonObject,
            gvl = GlobalVendorListJson.fromInitBody(body),
            adTechProviders = AdditionalConsent.providers(body?.get("adTechProviders")),
            adTechProvidersInvalid = body?.get("adTechProviders")?.let {
                it != JsonNull && AdditionalConsent.providers(it) == null
            } ?: false,
            customVendors = com.inth.core.iab.IabCustomVendor.list(body?.get("customVendors")),
            customVendorsInvalid = body?.get("customVendors")?.let { com.inth.core.iab.IabCustomVendor.list(it) == null } ?: false,
			error = error,
		)
	}

	private fun initFailureMessage(read: PolicyRead, reason: String?): String = when (read) {
		is PolicyRead.Unreadable ->
			"Inth: /v1/consent/init returned a policy resolution this SDK cannot read ($reason); consent stays deny-all"
		else -> "Inth: /v1/consent/init policy resolution failed ($reason); consent stays deny-all"
	}

	private fun JsonObject?.stringOrNull(key: String): String? {
		val value = this?.get(key) as? JsonPrimitive ?: return null
		return value.contentOrNull?.takeIf { it.isNotEmpty() }
	}
}
