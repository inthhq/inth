@file:OptIn(ExperimentalSerializationApi::class)

package com.inth.core.model

import com.inth.core.tc.GlobalVendorList
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.JsonObject

/**
 * Interaction the active policy still requires.
 *
 * `notice` is the first-layer prompt (banner), `acknowledge` the explicit
 * choice. `purpose` distinguishes a first prompt from a re-prompt caused by an
 * expired or changed policy.
 */
@Serializable
data class PromptRequirement(
	val notice: Boolean = false,
	val acknowledge: Boolean = false,
	val purpose: PromptPurpose? = null,
	/**
	 * The kernel's reason for the owed prompt, carried verbatim onto the wire.
	 *
	 * `purpose` cannot answer this and stays what it always was: the in-app hint
	 * that says whether anything was ever recorded. Only the obligation's *kind*
	 * travels as `purpose`, so leaving the reason to be re-derived from it would
	 * lose `expired`, which the kernel reports on its own terms.
	 */
	val reason: PromptReason? = null,
) {
	companion object {
		/** Nothing owed. */
		val NONE = PromptRequirement()
	}
}

/**
 * Policy resolution outcome carried on the snapshot.
 *
 * [status] is the raw wire status: `matched`, `no-match`, `unconfigured`, or
 * `failed`. [reason] is only present for `failed` and names why, mirroring
 * `PolicyResolutionFailure` in `@inth/sdk-schema`.
 */
@Serializable
data class PolicyResolution(
	val status: String = STATUS_UNCONFIGURED,
	val policyId: String? = null,
	val fingerprint: String? = null,
	val reason: String? = null,
) {
	val matched: Boolean
		get() = status == STATUS_MATCHED

	companion object {
		const val STATUS_MATCHED = "matched"
		const val STATUS_NO_MATCH = "no-match"
		const val STATUS_UNCONFIGURED = "unconfigured"
		const val STATUS_FAILED = "failed"

		const val REASON_INVALID_CONFIGURATION = "invalid-configuration"
		const val REASON_INSUFFICIENT_INPUTS = "insufficient-inputs"
		const val REASON_TRANSPORT = "transport"
		/**
		 * The policy resolution names a value from a newer schema, such as a right or a
		 * `version` this build does not know. The `@c15t/schema` reader's label for that
		 * case; the core treats it as unreadable (contract rule 5).
		 */
		const val REASON_UNSUPPORTED_CONTRACT = "unsupported-contract"
		const val REASON_INVALID_PAYLOAD = "invalid-payload"

		/** A `failed` resolution with [reason], carrying no policy. */
		fun failed(reason: String): PolicyResolution = PolicyResolution(
			status = STATUS_FAILED,
			reason = reason,
		)
	}
}

/**
 * Subject identifiers.
 *
 * [id] is the Inth-owned id minted at first launch by `SubjectIdGenerator`: a lowercase
 * UUIDv7. A stored UUIDv7 or c15t `sub_` id is adopted untouched; anything else is
 * refused with the envelope written under it. A `/v1` response that names a different
 * canonical UUIDv7 replaces it. See `SubjectIdGenerator.isValid` and
 * `packages/native-protocol/CONTRACT.md`, Subject identity. Never derived from IDFV, ADID,
 * or any other hardware identifier.
 *
 * [previousIds] are the ids this subject replaced, newest first, at most
 * [MAX_PREVIOUS_IDS]. They stay the same subject on the device: a body queued under one
 * still delivers, and a decision stored under one still reads. They never reach the wire.
 */
@Serializable
data class ConsentSubject(
	val id: String,
	val externalId: String? = null,
	val previousIds: List<String> = emptyList(),
) {
	/** Whether [subjectId] is this subject: its id or one it replaced. */
	fun owns(subjectId: String?): Boolean = subjectId != null && (subjectId == id || subjectId in previousIds)

	/** This subject under [canonical], keeping [id] as the newest previous id. */
	fun replacingId(canonical: String): ConsentSubject = copy(
		id = canonical,
		previousIds = (listOf(id) + previousIds).filter { it != canonical }.distinct().take(MAX_PREVIOUS_IDS),
	)

	companion object {
		/** How many replaced ids the identity slot keeps, as the Swift core does. */
		const val MAX_PREVIOUS_IDS = 4
	}
}

/** Geographic context reported by the backend. */
@Serializable
data class ConsentLocation(
	val country: String? = null,
	val region: String? = null,
	val language: String? = null,
)

/**
 * Developer overrides that steer policy evaluation.
 *
 * [gpc] is the app's override, not a detection. It is load bearing: `@inth/sdk-core`
 * compares it against the decision inputs remembered from the last init and
 * rejects a save whose inputs no longer match, so a save body without it cannot
 * pass the backend's staleness check. Detection lives on [PrivacySignals.gpc].
 *
 * Publisher test mode is a client option rather than an override and never
 * reaches a save body, so it has no member here. The first draft of
 * `packages/native-protocol/CONTRACT.md` invented a `test` field; [com.inth.core.store.InthStore]
 * refuses an envelope that still carries one rather than guessing at it.
 */
@Serializable
data class KernelOverrides(
	val country: String? = null,
	val region: String? = null,
	val language: String? = null,
	val gpc: Boolean? = null,
)

/**
 * The `gpc` member of [PrivacySignals]: the Global Privacy Control signal in the
 * three parts the kernel keeps apart.
 *
 * An evaluator reads [active]. [detected] and [override] exist so a host can tell
 * why a signal is on, and so a write is not treated as stale just because a
 * device started reporting GPC on its own.
 *
 * [active] is an output, never an input. A plain `copy` would let a caller set
 * `active: true` beside `detected: false` and no override, which is a signal the
 * two inputs do not support, so [withDetection] and [withOverride] are the only
 * ways to change one. The kernel recomputes it on every read rather than trusting
 * a stored copy, so an envelope that claims a signal is on while saying nothing
 * detected it and nothing overrode it is answered with the value the other two
 * support.
 */
@Serializable
data class GpcSignal(
	val detected: Boolean = false,
	val override: Boolean? = null,
	val active: Boolean = false,
) {
	/** Re-derive `active` from [override], keeping the reported detection. */
	fun withOverride(override: Boolean?): GpcSignal = derive(override = override, detected = detected)

	/** Re-derive `active` from [detected], keeping the app's override if any. */
	fun withDetection(detected: Boolean): GpcSignal = derive(override = override, detected = detected)

	companion object {
		/** Derive the view the way `derivePrivacySignals` in `@inth/sdk-core` does. */
		fun derive(override: Boolean?, detected: Boolean): GpcSignal = GpcSignal(
			detected = detected,
			override = override,
			active = override ?: detected,
		)
	}
}

/**
 * Privacy signals the core honors, mirroring `KernelPrivacySignals`.
 *
 * There is no `msa` signal anywhere in v3. The first draft of
 * `packages/native-protocol/CONTRACT.md` carried one beside a boolean `gpc`; both are refused when
 * a stored envelope is read.
 */
@Serializable
data class PrivacySignals(
	val gpc: GpcSignal = GpcSignal.derive(override = null, detected = false),
)

/**
 * User identification attached to consent records. External id only: no PII
 * beyond what the integrator opts in to.
 */
@Serializable
data class KernelUser(
	val externalId: String,
	val identityProvider: String? = null,
	val properties: Map<String, String>? = null,
)

/** A failure the core wants the host to surface. */
@Serializable
data class KernelError(
	val code: String,
	val message: String,
)

/**
 * Explicit category choices, captured once per commit.
 *
 * [consents] holds the explicit value per optional category; absent keys are
 * undecided and the evaluator fills them from the policy default. [fingerprint]
 * is the choice-prompt fingerprint the choice was made against, so a policy
 * change invalidates it instead of silently reusing an old grant.
 *
 * [confirmedAt] holds the time of each category an earlier action confirmed and this
 * one kept. Every other category was confirmed at [actionAt]. Kept categories share
 * [fingerprint], because a commit keeps earlier values only under the same one.
 */
@Serializable
data class ExplicitChoice(
	val consents: Map<String, Boolean>,
	val action: ConsentAction,
	val actionAt: Long,
	val fingerprint: String? = null,
	val version: Int = 3,
	@EncodeDefault(EncodeDefault.Mode.NEVER)
	val confirmedAt: Map<String, Long> = emptyMap(),
) {
	/** Read the explicit value for [category], `null` when undecided. */
	fun valueOf(category: ConsentCategory): Boolean? = consents[category.wireName]

	/** When [category], a wire name, was last confirmed. */
	fun confirmedAtOf(category: String): Long = confirmedAt[category] ?: actionAt

	/** `true` when the choice was made against [currentFingerprint]. */
	fun matchesFingerprint(currentFingerprint: String?): Boolean {
		if (fingerprint == null || currentFingerprint == null) {
			return true
		}
		return fingerprint == currentFingerprint
	}
}

/** The categories one commit confirmed, with the single captured action time. */
@Serializable
data class ConfirmedCoverage(
	val categories: Map<String, Boolean>,
	/** Epoch milliseconds captured once, before any disk or network call. */
	val actionAt: Long,
)

/** Resolved policy inputs captured with an action, replayed unchanged on retry. */
@Serializable
data class DecisionInputs(
	val policyId: String? = null,
	val fingerprint: String? = null,
	val country: String? = null,
	val region: String? = null,
	val language: String? = null,
	val gpc: Boolean = false,
)

/**
 * The IAB half of a [ConsentSnapshot]: the vendor list this device was served.
 *
 * The key name is `KernelIABState`'s, from `packages/sdk/core/src/types.ts`, because
 * a renamed key is invisible across the bridge: the snapshot crosses into
 * JavaScript as text, so the declared type can say `iab.gvl` while the device
 * sends `iab.list`, and every app on that platform reads `undefined` with nothing
 * failing anywhere. Only `gvl` is carried. `authority`, `tcString`, `cmpId` and
 * the per-vendor vectors are IAB runtime state this core does not own, and an
 * absent key says that plainly where `enabled: false` would claim an answer about
 * a module that is not there.
 *
 * `gvl` is non-null, which is stricter than the web's nullable key on purpose: this
 * core only ever builds the container around a list it accepted, so a non-null `iab`
 * always means a list is held and a reader never has to tell "no list served" apart
 * from "no answer given". The price is that stored bytes reading `{"gvl":null}` --
 * which `core-swift` takes as a container holding no list -- are unreadable here,
 * and neither core writes them. Absence is carried by [ConsentSnapshot.iab] being
 * `null`, which is also what `packages/react-native/src/protocol/wire-shape.ts`
 * grades.
 *
 * The spellings inside the list are the served document's, not this core's: see
 * [GlobalVendorList] and [com.inth.core.tc.GlobalVendorListJson].
 */
@Serializable
data class KernelIabState(
	val gvl: GlobalVendorList,
)

/**
 * The one immutable consent state the native core holds, versioned by
 * [revision].
 *
 * Field set and semantics follow `packages/native-protocol/CONTRACT.md`, which is the mobile
 * projection of `ConsentSnapshot` in `packages/sdk/core/src/types.ts`. The IAB half
 * is the served vendor list on [iab], the same seam `KernelIABState` is on the
 * web and in `core-swift`.
 * Every mutation produces a new instance and bumps [revision]; readers never see
 * a partially updated snapshot.
 */
@Serializable
data class ConsentSnapshot(
	/** Monotonic revision, bumps on every mutation. */
	val revision: Long = 0,
	/** `true` until the first init resolves a policy the core can represent. */
	val policyPending: Boolean = true,
	/** `false` until a stored snapshot was hydrated or an init resolved. */
	val ready: Boolean = false,
	val model: ConsentModel = ConsentModel.OPT_IN,
	val activeUI: ActiveUI? = ActiveUI.NONE,
	val promptRequirement: PromptRequirement = PromptRequirement.NONE,
	val effectivePermissions: ConsentState = ConsentState.DENY_ALL,
	val explicitChoice: ExplicitChoice? = null,
	/** The categories the consent surfaces list: `necessary` plus the choice scope. */
	val consentCategories: List<String>? = null,
	/** Category name to restriction reasons, for explainability. */
	val restrictions: Map<String, List<String>> = emptyMap(),
	val resolution: PolicyResolution = PolicyResolution(),
	/** Signed token for write-time consistency, sent back on save. */
	val policySnapshotToken: String? = null,
	val subject: ConsentSubject? = null,
	val location: ConsentLocation? = null,
	val overrides: KernelOverrides = KernelOverrides(),
	val privacySignals: PrivacySignals = PrivacySignals(),
	/** Opaque translation bundle from `/init`, carried through untouched. */
	val translations: JsonObject? = null,
	/** Earliest future time (epoch ms) that can change permissions or the prompt. */
	val nextDeadline: Long? = null,
	/** Epoch milliseconds of the last evaluation. */
	val evaluatedAt: Long = 0,
	val error: KernelError? = null,
	/**
	 * The vendor list this device is reading its disclosure out of, or `null` while
	 * no `/init` has served one this build could accept.
	 *
	 * Latched, and it travels with the snapshot rather than beside it: a `/init`
	 * that serves no list leaves the list already there, and only
	 * [com.inth.core.ConsentCore.reset] takes it back. The reason is on that field --
	 * once a purpose or vendor name has been on screen, replacing it with nothing
	 * changes a claim the subject was already given, and the backend embeds a list
	 * only while the matched model is `iab`.
	 *
	 * The key is always present on the wire, `null` written where there is no list,
	 * so a JavaScript layer that predates TCF does not branch on the SDK version.
	 * Storage keeps the document once, under the envelope's own `gvl` key, and puts
	 * it back here on hydration -- see
	 * [com.inth.core.store.SnapshotEnvelope.gvl].
	 */
	@SerialName("iab")
	val iab: KernelIabState? = null,
	/**
	 * The [revision] at which the prompt owed now became owed, or `null` while nothing is owed.
	 *
	 * It changes every time a prompt becomes owed again, including the same requirement owed
	 * again after an answer or a reset, so a reader that missed the snapshots in between still
	 * knows it is a new prompt. The core sets it where it installs each state, which sees every
	 * state in order. It is not kernel state: it stays out of [com.inth.core.wire.SnapshotWire]
	 * and the stored envelope, and the React Native bridge adds it to its payload.
	 */
	@Transient
	val promptOwedSince: Long? = null,
	/**
	 * The IAB GPP string for this state, or `null` when GPP is off or no section applies.
	 *
	 * Derived, never decided: the core computes it from this snapshot, the matched rule and
	 * the committed TC String each time it installs a state, with
	 * [com.inth.core.gpp.GppResolver]. It is `null` in the stored envelope, which keeps no
	 * copy of a value it can recompute. The key is always present on the wire.
	 */
	val gppString: String? = null,
) {
	/**
	 * Whether [category] may run right now.
	 *
	 * `necessary` is always granted. While [ready] or [policyPending] is unset
	 * every optional category reads `false`, which is the deny-all contract both
	 * flags guard.
	 */
	fun isAllowed(category: ConsentCategory): Boolean {
		if (!category.optional) {
			return true
		}
		if (!ready || policyPending) {
			return false
		}
		return effectivePermissions[category]
	}

	/**
	 * Whether this snapshot is in a state that answers for a decision: hydrated, and
	 * with the first policy resolution folded in.
	 *
	 * The two flags stay separate fields because the evaluator and the wire need them
	 * apart. This is the pair a host SDK reads as one question, and it is computed
	 * rather than stored so it cannot contradict the flags it comes from.
	 */
	val isReady: Boolean
		get() = ready && !policyPending

	/**
	 * Why [category] may or may not run, as the three states a native SDK gate
	 * reports.
	 *
	 * Derived from this snapshot and nothing else, so a gate can never disagree with
	 * the state the UI is showing. [ConsentDecision.PENDING] is what [isReady] false
	 * answers for every optional category: the device has not been told yet, so the
	 * `false` in [effectivePermissions] is not a refusal and must not end the wait.
	 */
	fun decision(category: ConsentCategory): ConsentDecision {
		if (!category.optional) {
			return ConsentDecision.GRANTED
		}
		if (!isReady) {
			return ConsentDecision.PENDING
		}
		return if (effectivePermissions[category]) {
			ConsentDecision.GRANTED
		} else {
			ConsentDecision.DENIED
		}
	}

	companion object {
		/** The snapshot a cold start with nothing stored answers with. */
		fun denyAll(subject: ConsentSubject? = null, now: Long = 0): ConsentSnapshot = ConsentSnapshot(
			policyPending = true,
			ready = false,
			effectivePermissions = ConsentState.DENY_ALL,
			subject = subject,
			evaluatedAt = now,
		)
	}
}
