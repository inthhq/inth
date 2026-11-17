package com.c15t.core.gpp

import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.PolicyResolution
import com.c15t.core.policy.EvaluationPolicy
import com.c15t.core.policy.PolicyRight

/**
 * MSPA mode for covered transactions: `GPPMspaMode` in `@c15t/iab/gpp`. Leave it unset
 * unless the publisher signed the IAB Multi-State Privacy Agreement.
 */
enum class GppMspaMode(val wireName: String) {
	/** The publisher offers the opt-outs itself. */
	OPT_OUT_OPTION("opt-out-option"),

	/**
	 * The publisher neither sells nor shares personal data nor uses it for targeted
	 * advertising, so the opt-outs and their notices are reported as not applicable.
	 */
	SERVICE_PROVIDER("service-provider"),
	;

	companion object {
		/** Parse a wire value, returning `null` for unknown values. */
		fun fromWireName(value: String?): GppMspaMode? = entries.firstOrNull { it.wireName == value }
	}
}

/**
 * Turns GPP on, with the options web c15t's `gpp` option takes that apply on a device.
 *
 * GPP is off while [com.c15t.core.NativeConfig.gpp] is `null`, as it is on web until an
 * app renders `ConsentGPP` or sets `gpp: true`. The notice fields a US section reports
 * are the app's attestation that it shows those notices, so the SDK does not make that
 * claim on its own.
 *
 * @property mspaMode MSPA mode. `null` reports the transaction as not covered.
 * @property optOutCategories Categories whose refusal opts the visitor out of sale,
 *   sharing and targeted advertising.
 * @property tcf Include the TCF EU section, the committed TC String, under an `iab` rule.
 */
data class GppOptions(
	val mspaMode: GppMspaMode? = null,
	val optOutCategories: List<ConsentCategory> = listOf(ConsentCategory.MARKETING),
	val tcf: Boolean = true,
)

/** The GPP sections that apply to a snapshot, and the string that carries them. */
data class GppSignal(val sections: List<GppSection>) {
	/** The full GPP string, header first. */
	val gppString: String = requireNotNull(GppEncoder.encodeGppString(sections)) { "GPP: no section." }

	/** Section IDs in force, ascending: `applicableSections` on web, `IABGPP_GppSID` in app. */
	val sectionIds: List<Int> = sections.map { it.id }.sorted()
}

/**
 * Decides which GPP sections apply and fills them: `resolveUSSectionDefinition` and
 * `resolveUSSectionValues` in `packages/sdk/iab/src/gpp/us-section.ts`, restricted to the
 * sections a device encodes (US National and TCF EU).
 *
 * The policy decides first. Nothing applies until a matched policy is resolved and the
 * snapshot is ready. An `iab` rule gets the TCF EU section once a TC String is committed.
 * Any other rule gets US National when it gives the visitor a way to opt out (the
 * `preferences` or `opt-out` right) and the visitor's country is `US`.
 */
object GppResolver {
	private val GENERAL_NOTICES = setOf("SharingNotice")
	private val OPT_OUT_NOTICES = setOf("SaleOptOutNotice", "SharingOptOutNotice", "TargetedAdvertisingOptOutNotice")
	private val OPT_OUTS = setOf("SaleOptOut", "SharingOptOut", "TargetedAdvertisingOptOut")

	/**
	 * The GPP signal for [snapshot], or `null` when GPP is off or no section applies.
	 *
	 * @param policy the matched rule the snapshot was evaluated under.
	 * @param tcString the committed TC String, only while it is valid.
	 * @param options GPP options, `null` when the app has not turned GPP on.
	 */
	fun resolve(
		snapshot: ConsentSnapshot,
		policy: EvaluationPolicy?,
		tcString: String?,
		options: GppOptions?,
	): GppSignal? {
		if (options == null || policy == null || !snapshot.ready || snapshot.policyPending ||
			snapshot.resolution.status != PolicyResolution.STATUS_MATCHED
		) return null
		val sections = mutableListOf<GppSection>()
		if (policy.model == ConsentModel.IAB) {
			if (options.tcf && !tcString.isNullOrEmpty()) sections += GppSection(GPP_TCF_EU_SECTION_ID, tcString)
		} else if (country(snapshot) == "US" &&
			(PolicyRight.PREFERENCES in policy.rights || PolicyRight.OPT_OUT in policy.rights)
		) {
			sections += GppSection(
				GppUsNational.ID,
				GppEncoder.encodeUsNational(usNationalValues(snapshot, policy, options), snapshot.privacySignals.gpc.active),
			)
		}
		return if (sections.isEmpty()) null else GppSignal(sections)
	}

	/** The visitor's country: the app's override, else the backend's location. */
	internal fun country(snapshot: ConsentSnapshot): String? =
		(snapshot.overrides.country ?: snapshot.location?.country)?.uppercase()

	/**
	 * US National core values. Sensitive data, known-child and personal data consents
	 * are `0` (not applicable): no c15t category describes them.
	 */
	fun usNationalValues(
		snapshot: ConsentSnapshot,
		policy: EvaluationPolicy,
		options: GppOptions,
	): Map<String, List<Int>> {
		val disclosed = PolicyRight.DISCLOSURE in policy.rights
		val optedOut = options.optOutCategories.any { !snapshot.effectivePermissions[it] }
		val covered = options.mspaMode != null
		val serviceProvider = options.mspaMode == GppMspaMode.SERVICE_PROVIDER
		fun yesNo(value: Boolean) = if (value) 1 else 2
		val values = LinkedHashMap<String, List<Int>>()
		for (field in GppUsNational.CORE) {
			val count = field.count
			values[field.name] = when {
				count != null -> List(count) { 0 }
				field.name == "Version" -> listOf(GppUsNational.VERSION)
				field.name in GENERAL_NOTICES -> listOf(yesNo(disclosed))
				field.name in OPT_OUT_NOTICES -> listOf(if (serviceProvider) 0 else 1)
				field.name in OPT_OUTS -> listOf(if (serviceProvider) 0 else yesNo(optedOut))
				field.name == "MspaCoveredTransaction" -> listOf(yesNo(covered))
				field.name == "MspaOptOutOptionMode" ->
					listOf(if (covered) yesNo(options.mspaMode == GppMspaMode.OPT_OUT_OPTION) else 0)
				field.name == "MspaServiceProviderMode" -> listOf(if (covered) yesNo(serviceProvider) else 0)
				else -> listOf(0)
			}
		}
		return values
	}
}
