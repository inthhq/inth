package com.c15t.reactnative

import com.c15t.core.CommitIntent
import com.c15t.core.CommitResult
import com.c15t.core.ConsentCore
import com.c15t.core.iab.IabChoices
import com.c15t.core.iab.IabCommittedConsent
import com.c15t.core.iab.IabCustomVendor
import com.c15t.core.iab.IabPresentation
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.KernelError
import com.c15t.core.model.KernelOverrides
import com.c15t.core.store.C15tJson
import com.c15t.core.transport.C15tProtocol
import com.c15t.core.wire.SnapshotWire
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * Outcome of reading a `NativeOverridesInput` document.
 *
 * Refusal carries the sentence the host hears, because the two ways a document fails
 * need different fixes: a document that is not an override set at all is a bad call,
 * while one that names a retired field is a host app still speaking the old protocol.
 * Answering the second with the first message would send the integrator looking in the
 * wrong file.
 */
sealed interface OverridesRead {
	/** The document was readable. Apply [overrides] as a replacement. */
	data class Applied(val overrides: KernelOverrides) : OverridesRead

	/** The document was refused, with the [code] and [message] the host receives. */
	data class Refused(val code: String, val message: String) : OverridesRead
}

/**
 * The JSON the bridge speaks, with no React Native types anywhere in it.
 *
 * Field names come from `src/protocol` on the JavaScript side, which owns the wire
 * format. Keeping the encoders and decoders free of `com.facebook.react` imports is
 * what lets the whole boundary be unit tested on a plain JVM, and it keeps one
 * encoding shared by the module and the tests instead of two that can disagree.
 */
object C15tPayload {
	/** Protocol this native build speaks. */
	const val PROTOCOL_VERSION = 1L

	/** Oldest protocol this native build accepts from a JavaScript package. */
	const val MIN_SUPPORTED_PROTOCOL_VERSION = 1L

	/** Newest protocol this native build accepts from a JavaScript package. */
	const val MAX_SUPPORTED_PROTOCOL_VERSION = 1L

	/** Language used when neither the app nor the backend resolved one. */
	const val DEFAULT_LANGUAGE = "en"

	/** Reported when the core was never installed, so nothing can be recorded. */
	const val REASON_NOT_BOOTSTRAPPED = "not-bootstrapped"

	/** Reported for an intent this build cannot read. */
	const val REASON_INVALID_INTENT = "invalid-intent"

	/** Rejection code for a `setOverrides` document this build cannot read. */
	const val REJECT_OVERRIDES = "C15T_OVERRIDES_REJECTED"

	/**
	 * Rejection code for a `setOverrides` document that names a retired field.
	 *
	 * Separate from [REJECT_OVERRIDES] on purpose: a host that sees the retired code
	 * has one line to change, while the generic code means the document itself is
	 * malformed.
	 */
	const val REJECT_OVERRIDES_RETIRED = "C15T_OVERRIDES_RETIRED"

	/** What a host hears when no core exists, naming both ways to fix it. */
	const val MESSAGE_NOT_BOOTSTRAPPED =
		"c15t has no usable configuration, so the consent core was not started. Declare " +
			"com.c15t.BACKEND_URL in the manifest with your Inth project URL, such as " +
			"https://your-project.inth.app, or call C15tAndroid.install yourself before " +
			"React Native initializes. If the key is declared, logcat tag c15t says why it was refused."

	/** The override keys `NativeOverridesInput` declares, in wire order. */
	private val OVERRIDE_INPUT_KEYS = setOf("country", "region", "language", "gpc")

	/** The key `NativeOverrides` always carries, even when the core has no value. */
	private val OVERRIDE_NULL_KEYS = listOf("country", "region", "gpc")

	/**
	 * Field names a host app may still send that this build does not model.
	 *
	 * `native/CONTRACT.md` first described a `test` override and an `msa` privacy
	 * signal. Neither exists in the kernel: publisher test mode is a client option
	 * that never reaches a save body, and v3 has no `msa` signal. `KernelOverrides`
	 * has no member for either, so accepting the document would drop what the caller
	 * asked for and leave the app believing a mode was on that nothing turned on.
	 * [com.c15t.core.store.RetiredWireFields] refuses the same names in a stored
	 * envelope; this refuses them on the way in, and says which one.
	 */
	private val RETIRED_OVERRIDE_NAMES = listOf("test", "msa")

	/**
	 * Retired keys that must never reach the wire.
	 *
	 * The core's encoder cannot produce these today, and a stored envelope carrying
	 * them is refused before a snapshot is built. This is the last gate in front of
	 * JavaScript, kept because a retired name on the wire would read as a real field.
	 */
	private val RETIRED_WIRE_KEYS = setOf("test", "msa")

	private const val MAX_ECHO_CHARS = 200

	/**
	 * The `BootstrapPayload` handshake, read once per provider mount.
	 *
	 * @param snapshot the current snapshot, which carries the subject id.
	 * @param hasStoredSnapshot whether hydration found a stored envelope.
	 * @param sdkVersion native SDK version, also sent as `x-c15t-version`.
	 */
	fun bootstrap(
		snapshot: ConsentSnapshot,
		hasStoredSnapshot: Boolean,
		sdkVersion: String = C15tProtocol.DEFAULT_SDK_VERSION,
	): String = encode(
		buildJsonObject {
			put("protocolVersion", PROTOCOL_VERSION)
			put("minSupportedProtocolVersion", MIN_SUPPORTED_PROTOCOL_VERSION)
			put("maxSupportedProtocolVersion", MAX_SUPPORTED_PROTOCOL_VERSION)
			put("nativeSdkVersion", sdkVersion)
			putElement("subjectId", snapshot.subject?.id)
			put("hasStoredSnapshot", hasStoredSnapshot)
			// This build passes a commit's `revision` to the core as `expectedRevision`.
			put("commitRevision", true)
			put("nativeUI", C15tNativeUi.AVAILABLE)
		},
	)

	/** The presenter events, by the names `src/native/presenter.ts` listens for. */
	const val EVENT_PRESENTER_OUTCOME = "onConsentPresenterOutcome"
	const val EVENT_PRESENTER_PRESENTED = "onConsentPresenterPresented"
	const val EVENT_PRESENTER_UNAVAILABLE = "onConsentPresenterUnavailable"

	/** What a presenter call rejects with in a build without the stock consent screens. */
	const val REJECT_NATIVE_UI_EXCLUDED = "C15T_NATIVE_UI_EXCLUDED"
	const val MESSAGE_NATIVE_UI_EXCLUDED =
		"This build leaves out the stock consent screens (c15t.nativeUI is false). Render your own consent UI with the headless hooks."

	/**
	 * The `ConsentSnapshot` wire form.
	 *
	 * [SnapshotWire] produces the body, so the four objects the kernel owns the key names
	 * of -- `subject`, `location`, `promptRequirement`, `explicitChoice` -- go out with the
	 * kernel's spelling rather than this core's. The boundary is a JSON string, so a key
	 * renamed on this side is invisible to the TypeScript that reads it: the declared type
	 * says `subject.subjectId`, the device sends `subject.id`, and the app reads
	 * `undefined` with nothing failing anywhere.
	 *
	 * The stored envelope therefore disagrees with this payload on exactly those four
	 * objects, deliberately: the envelope is the device's own format and an installed app
	 * has to keep reading the bytes it wrote before the upgrade, while this is the kernel's
	 * format because it crosses into JavaScript as text. Do not "fix" the disagreement.
	 *
	 * Two fields are then conformed to the JavaScript types, both
	 * because the kernel models them more loosely than the protocol does:
	 * `overrides.language` is never null on the wire, since the protocol resolves to
	 * exactly one translation bundle and a missing language falls back to the device
	 * locale and then to `en`; and every override the protocol declares as
	 * `T | null` is present as an explicit null, so a JavaScript reader never has to
	 * branch on presence.
	 *
	 * `promptOwedSince` is added here, always present and `null` while nothing is owed. The
	 * core tracks it but it is not kernel state, so [SnapshotWire] does not carry it.
	 *
	 * `privacySignals.gpc` goes out untouched as the `detected` / `override` /
	 * `active` triple the core computes. It is what makes a GPC denial explainable
	 * from the payload alone: `active` is the reason a category is denied, and
	 * `override` says whether the app or the device caused it.
	 */
	fun snapshot(
		snapshot: ConsentSnapshot,
		fallbackLanguage: String = DEFAULT_LANGUAGE,
		iabConsent: IabCommittedConsent? = null,
		iabAcceptAll: IabChoices? = null,
		iabPresentation: IabPresentation? = null,
		iabCustomVendors: List<IabCustomVendor> = emptyList(),
	): String {
		val wire = SnapshotWire.toJsonElement(snapshot)
		val overrides = wire["overrides"] as? JsonObject ?: JsonObject(emptyMap())
		val language = optString(overrides["language"]) ?: fallbackLanguage.ifBlank { DEFAULT_LANGUAGE }

		val conformedOverrides = LinkedHashMap<String, JsonElement>(overrides.size + OVERRIDE_NULL_KEYS.size)
		for ((key, value) in overrides) {
			if (key !in RETIRED_WIRE_KEYS) {
				conformedOverrides[key] = value
			}
		}
		conformedOverrides["language"] = JsonPrimitive(language)
		for (key in OVERRIDE_NULL_KEYS) {
			if (!conformedOverrides.containsKey(key)) {
				conformedOverrides[key] = JsonNull
			}
		}

		val conformed = LinkedHashMap<String, JsonElement>(wire.size)
		for ((key, value) in wire) {
			if (key != "overrides") {
				conformed[key] = value
			}
		}
		conformed["overrides"] = JsonObject(conformedOverrides)
		// Not kernel state, so SnapshotWire leaves it out; JavaScript reads it to tell a new
		// owed prompt from one it already presented, even when it skipped the snapshots between.
		conformed["promptOwedSince"] = snapshot.promptOwedSince?.let(::JsonPrimitive) ?: JsonNull
		// The iOS bridge reads whether the TC String consents to the marketing purposes, for
		// App Tracking Transparency. Android has no ATT, so the key is always present and null.
		conformed["iabMarketingPurposes"] = JsonNull

		// The headless TCF state rides inside `iab`: the committed decision a screen shows and
		// reopens with (`null` while none is current), whether a draft can be edited and saved
		// now, what Accept all saves under the publisher's disclosure, and `disclosure`, the
		// core's own projection the stock screens draw (legal bases after publisher
		// restrictions, Additional Consent providers, partner counts, the first-layer summary).
		// `acceptAll` is `null` exactly when `editable` is false, and editing needs the
		// disclosure, so no custom screen saves choices it was not given the means to show.
		// `headlessUnsupported` is always empty from this build: older builds listed
		// `publisher-restrictions` and `additional-consent-providers` there, before `disclosure`
		// carried both.
		(conformed["iab"] as? JsonObject)?.let { iab ->
			val acceptAll = iabAcceptAll?.takeIf { iabPresentation != null }
			conformed["iab"] = JsonObject(
				iab + mapOf(
					"committed" to (iabConsent?.let(::committedIab) ?: JsonNull),
					"editable" to JsonPrimitive(acceptAll != null),
					"acceptAll" to (acceptAll?.let { C15tJson.storage.encodeToJsonElement(IabChoices.serializer(), it) } ?: JsonNull),
					"headlessUnsupported" to JsonArray(emptyList()),
					"disclosure" to (iabPresentation?.let(::iabDisclosure) ?: JsonNull),
					// The core's `iabCustomVendors()`: the non-IAB partners a screen lists and decides
					// on. Absent optionals are left out, as Swift encodes them.
					"customVendors" to CUSTOM_VENDOR_JSON.encodeToJsonElement(ListSerializer(IabCustomVendor.serializer()), iabCustomVendors),
				),
			)
		}
		return encode(JsonObject(conformed))
	}

	/**
	 * Read the snapshot and the bridge's additions to it as one revision.
	 *
	 * The core locks each accessor on its own, so a commit between `snapshot()` and
	 * `iabConsent` would pair one revision's snapshot with the next one's TCF decision, and
	 * JavaScript caches a payload by its revision. The additions are read between two
	 * snapshot reads and kept only when both name the same revision; otherwise the read
	 * starts again, up to [attempts] times, and the last read is returned.
	 */
	fun <AdditionsType> consistently(
		snapshot: () -> ConsentSnapshot,
		attempts: Int = 4,
		additions: () -> AdditionsType,
	): Pair<ConsentSnapshot, AdditionsType> {
		var before = snapshot()
		var read = additions()
		repeat(attempts - 1) {
			val after = snapshot()
			if (after.revision == before.revision) return before to read
			before = after
			read = additions()
		}
		return before to read
	}

	/**
	 * The `iab.disclosure` object: what [IabPresentation] gives the stock screens, so a headless
	 * screen shows the same legal bases, providers and counts without computing them.
	 */
	internal fun iabDisclosure(presentation: IabPresentation): JsonObject {
		fun ids(values: List<Int>) = JsonArray(values.map { JsonPrimitive(it) })
		val summary = presentation.bannerSummary
		return buildJsonObject {
			put("adTechProviderPurposeIds", ids(presentation.adTechProviderPurposeIds))
			put(
				"adTechProviders",
				presentation.adTechProviders?.let { providers ->
					JsonArray(
						providers.map { provider ->
							buildJsonObject {
								put("id", provider.id)
								put("name", provider.name)
								put("policyUrl", provider.policyUrl)
							}
						},
					)
				} ?: JsonNull,
			)
			put(
				"bannerSummary",
				buildJsonObject {
					put("displayItems", JsonArray(summary.displayItems.map { JsonPrimitive(it) }))
					put("remainingCount", summary.remainingCount)
					put("vendorCount", summary.vendorCount)
				},
			)
			put("consentStorageMaxDays", presentation.consentStorageMaxDays?.let(::JsonPrimitive) ?: JsonNull)
			put("declaredPurposeIds", ids(presentation.declaredPurposeIds))
			put("declaredSpecialFeatureIds", ids(presentation.declaredSpecialFeatureIds))
			put("language", presentation.language)
			put(
				"purposes",
				buildJsonObject {
					for (id in presentation.declaredPurposeIds) {
						val counts = presentation.partnerCounts(id)
						put(
							id.toString(),
							buildJsonObject {
								put("consentPartnerCount", counts.consent)
								put("legitimateInterestPartnerCount", counts.legitimateInterest)
							},
						)
					}
				},
			)
			put(
				"vendors",
				buildJsonObject {
					for ((id, disclosure) in presentation.vendors.toSortedMap()) {
						put(
							id.toString(),
							buildJsonObject {
								put("consentPurposes", ids(disclosure.consentPurposes))
								put("consentRequiredPurposes", ids(disclosure.consentRequiredPurposes))
								put("legitimateInterestPurposes", ids(disclosure.legitimateInterestPurposes))
								put("legitimateInterestRequiredPurposes", ids(disclosure.legitimateInterestRequiredPurposes))
								put("notAllowedPurposes", ids(disclosure.notAllowedPurposes))
							},
						)
					}
				},
			)
		}
	}

	/** The committed IAB decision as JavaScript reads it. */
	internal fun committedIab(consent: IabCommittedConsent): JsonObject = buildJsonObject {
		putElement("addtlConsent", consent.addtlConsent)
		put("choices", C15tJson.storage.encodeToJsonElement(IabChoices.serializer(), consent.choices))
		put("tcString", consent.tcString)
	}

	/**
	 * The `CommitResult` for [result].
	 *
	 * `confirmed` is a list of category names on the wire, so the kernel's map becomes
	 * its keys: a recorded denial is a receipt in the same way an acceptance is, and
	 * the JavaScript side reads only the names.
	 *
	 * A rejection's `error.code` is copied to `reason`, which is how
	 * `CommitFailureReason` reaches JavaScript. `not-bootstrapped` arrives here when
	 * the core went away between the module's check and the save.
	 */
	fun commitResult(
		result: CommitResult,
		snapshot: ConsentSnapshot,
	): String = encode(
		buildJsonObject {
			put("ok", result.ok)
			if (result.ok) {
				put("revision", result.revision)
			} else {
				put("revision", JsonNull)
			}
			put("confirmed", JsonArray(result.confirmed.keys.map { JsonPrimitive(it) }))
			putElement("subjectId", snapshot.subject?.id)
			put("queued", result.queued)
			put("delivered", result.delivered)
			result.error?.let { put("reason", it.code) }
		},
	)

	/** The failure shape for an intent that could not be read. */
	fun invalidIntent(raw: String?): String = encode(
		buildJsonObject {
			put("ok", false)
			put("revision", JsonNull)
			put("confirmed", JsonArray(emptyList()))
			put("subjectId", JsonNull)
			put("queued", false)
			put("reason", REASON_INVALID_INTENT)
			put("detail", (raw ?: "").take(MAX_ECHO_CHARS))
		},
	)

	/** The failure shape for a core that was never installed. */
	fun notBootstrapped(): String = encode(
		buildJsonObject {
			put("ok", false)
			put("revision", JsonNull)
			put("confirmed", JsonArray(emptyList()))
			put("subjectId", JsonNull)
			put("queued", false)
			put("reason", REASON_NOT_BOOTSTRAPPED)
		},
	)

	/**
	 * The `TrackingAuthorizationPayload` both tracking calls resolve with.
	 *
	 * One field, because the arm is the whole answer. There is no consent field here and
	 * there never will be: this carries what the platform said, and on Android what it
	 * says is that it has no question.
	 */
	fun trackingAuthorization(status: C15tTrackingAuthorization): String = encode(
		buildJsonObject {
			put("status", status.wireValue)
		},
	)

	/** A `snapshot` event: the new revision and the dirty flag, nothing else. */
	fun snapshotEvent(revision: Long): String = encode(
		buildJsonObject {
			put("revision", revision)
			put("dirty", true)
		},
	)

	/** An `initialized` event, emitted once when the first policy resolves. */
	fun initializedEvent(revision: Long): String = encode(
		buildJsonObject {
			put("revision", revision)
			put("dirty", true)
			put("ready", true)
			put("policyPending", false)
		},
	)

	/** An `onConsentPresenterUnavailable` event: an owed prompt has nowhere to show yet. */
	fun presenterUnavailable(code: String, message: String): String = encode(
		buildJsonObject {
			put("code", code)
			put("message", message)
		},
	)

	/** What `configureAutoPresent` reads: whether native presents by itself, and the URL. */
	data class AutoPresentSettings(val autoPresent: Boolean, val privacyPolicyUrl: String?)

	/**
	 * Read a `configureAutoPresent` body, the `NativeAutoPresentSettings` shape.
	 *
	 * @return The settings, or `null` when `autoPresent` is not a boolean.
	 */
	fun parseAutoPresentSettings(raw: String?): AutoPresentSettings? {
		val body = parseObject(raw) ?: return null
		val autoPresent = (body["autoPresent"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: return null
		val url = (body["privacyPolicyURL"] as? JsonPrimitive)?.takeIf { it.isString }?.content
		return AutoPresentSettings(autoPresent, url)
	}

	/** An `error` event, in the `NativeSnapshotError` shape. */
	fun errorEvent(error: KernelError): String = encode(
		buildJsonObject {
			put("code", error.code)
			put("message", error.message)
		},
	)

	/**
	 * Apply a `commit(intent)` body to [core] and encode the result.
	 *
	 * A draft names the snapshot revision it was built on, and the core refuses the
	 * commit with `concurrent-change` if the record moved since: JavaScript reads a
	 * cached snapshot, so only this check can see a decision recorded in between. A
	 * `revision` that is not a whole number is refused as `invalid-intent` rather than
	 * saved unchecked.
	 *
	 * @param raw the JSON intent from `commit`.
	 * @param core the bootstrapped core.
	 * @return the `CommitResult` JSON.
	 */
	fun commit(raw: String?, core: ConsentCore): String {
		val parsed = parseCommitIntent(raw) ?: return invalidIntent(raw)
		val revision = when (val value = parseObject(raw)?.get("revision")) {
			null -> null
			else -> (value as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull ?: return invalidIntent(raw)
		}
		// A headless draft may not carry a vendor signal the publisher's restrictions rule out.
		// The stock screens never offer one, and the TC encoder would keep its bit. Read against
		// the disclosure the draft was opened on; a newer one fails `concurrent-change` anyway.
		if (parsed is CommitIntent.Iab) {
			val presentation = core.iabPresentation()
			if (presentation != null && presentation.draft.revision == revision &&
				presentation.restrictionConflicts(parsed.choices).isNotEmpty()
			) {
				return refused(REASON_INVALID_IAB_CHOICES, core.snapshot())
			}
		}
		return commitResult(core.save(parsed, expectedRevision = revision), core.snapshot())
	}

	/**
	 * Reported for a headless TCF draft that contradicts a publisher restriction, the same code
	 * the core uses for IDs and legal bases the list does not allow.
	 */
	const val REASON_INVALID_IAB_CHOICES = "invalid-iab-choices"

	/** The failure shape for a commit the bridge refused before it reached the core. */
	internal fun refused(reason: String, snapshot: ConsentSnapshot): String = encode(
		buildJsonObject {
			put("ok", false)
			put("revision", JsonNull)
			put("confirmed", JsonArray(emptyList()))
			putElement("subjectId", snapshot.subject?.id)
			put("queued", false)
			put("delivered", false)
			put("reason", reason)
		},
	)

	/**
	 * Read a `CommitIntent`.
	 *
	 * Anything unreadable, or outside the four actions, returns `null` and the caller
	 * answers [REASON_INVALID_INTENT]. A commit is evidence, so a malformed one is
	 * refused rather than rounded to the nearest action.
	 */
	fun parseCommitIntent(raw: String?): CommitIntent? {
		val body = parseObject(raw) ?: return null
		// `explicit` is `action`, `consents` and an optional `revision`; `iab` adds
		// `choices`; `all` and `necessary` are `action` alone. Any other key, such as a
		// `categories` scope or `consents` on a bulk action, is refused rather than
		// dropped: dropping it would apply the action to the whole choice scope, which is
		// not what the caller sent. [commit] reads `revision`.
		val allowed = when (optString(body["action"])) {
			"explicit" -> setOf("action", "consents", "revision")
			"iab" -> setOf("action", "choices", "consents", "revision")
			else -> setOf("action")
		}
		if (!allowed.containsAll(body.keys)) {
			return null
		}
		return when (optString(body["action"])) {
			"all" -> CommitIntent.All
			"necessary" -> CommitIntent.Necessary
			"explicit" -> {
				val consents = body["consents"] as? JsonObject ?: return null
				CommitIntent.Custom(parseCategories(consents) ?: return null)
			}

			"iab" -> {
				// A complete TCF draft from a headless screen. The core validates every ID and
				// legal basis against the served list; this only refuses a body that is not
				// the documented shape, unknown keys included.
				val raw = body["choices"] as? JsonObject ?: return null
				// Tree decoding reads a quoted "1" as 1, which Swift refuses. Every ID must be
				// a JSON number on both platforms.
				val numeric = raw.filterKeys { it !in IAB_CUSTOM_VENDOR_LISTS }.values.all { list ->
					list == JsonNull || (list as? JsonArray)?.all { (it as? JsonPrimitive)?.isString == false } == true
				}
				// Custom vendor IDs are strings on both platforms; a number is refused, as Swift does.
				val named = raw.filterKeys { it in IAB_CUSTOM_VENDOR_LISTS }.values.all { list ->
					(list as? JsonArray)?.all { (it as? JsonPrimitive)?.isString == true } == true
				}
				// A complete draft, as Swift's decoder requires: every list is present.
				if (!numeric || !named || !raw.keys.containsAll(IAB_CHOICE_LISTS)) return null
				val choices = try {
					C15tJson.storage.decodeFromJsonElement(IabChoices.serializer(), raw)
				} catch (_: Exception) {
					return null
				}
				val consents = body["consents"] as? JsonObject ?: return null
				CommitIntent.Iab(choices, parseCategories(consents) ?: return null)
			}

			else -> null
		}
	}

	private val CUSTOM_VENDOR_JSON = Json { encodeDefaults = true; explicitNulls = false }

	/** The custom vendor lists a headless draft may name, by string vendor ID. */
	private val IAB_CUSTOM_VENDOR_LISTS = setOf("customVendorConsents", "customVendorLegitimateInterests")

	/** The `IabChoices` lists a headless draft must name, empty or not. */
	private val IAB_CHOICE_LISTS = listOf(
		"purposeConsents", "purposeLegitimateInterests", "purposeObjections",
		"vendorConsents", "vendorLegitimateInterests", "vendorObjections", "specialFeatureOptIns",
		"publisherConsents", "publisherLegitimateInterests", "publisherCustomConsents",
		"publisherCustomLegitimateInterests",
	)

	private fun parseCategories(consents: JsonObject): Map<ConsentCategory, Boolean>? {
		val parsed = LinkedHashMap<ConsentCategory, Boolean>(consents.size)
		for ((name, value) in consents) {
			val category = ConsentCategory.fromWireName(name) ?: return null
			val granted = optBoolean(value) ?: return null
			if (!category.optional) {
				// `necessary` is nobody's choice, so an intent offering it is not
				// one this build should apply.
				return null
			}
			parsed[category] = granted
		}
		return parsed
	}

	/**
	 * Read a `NativeOverridesInput` into a complete override record.
	 *
	 * The JavaScript side distinguishes omitted from explicit null: omitted keeps the
	 * current value, null clears it. [KernelOverrides] cannot express the difference,
	 * because both are a null member, so the merge happens here and the caller applies
	 * the result as a replacement.
	 *
	 * Two documents are refused rather than approximated. One that names no override
	 * at all is not an override document, and applying it would wipe a language the app
	 * relies on. One that names a retired field is a host still on the old protocol,
	 * and guessing past it would leave that app believing an override is in force.
	 *
	 * @param raw the JSON document from `setOverrides`.
	 * @param current the overrides in effect, normally from the live snapshot.
	 * @return [OverridesRead.Applied] with the record to apply, or
	 *   [OverridesRead.Refused] naming what the host has to change.
	 */
	fun parseOverrides(
		raw: String?,
		current: KernelOverrides,
	): OverridesRead {
		val body = parseObject(raw)
			?: return OverridesRead.Refused(
				REJECT_OVERRIDES,
				"the overrides document could not be read, so nothing was changed",
			)

		val retired = RETIRED_OVERRIDE_NAMES.filter { body.containsKey(it) }
		if (retired.isNotEmpty()) {
			return OverridesRead.Refused(
				REJECT_OVERRIDES_RETIRED,
				"the overrides document carries the retired field(s) " + retired.joinToString() +
					", which this build does not reinterpret: publisher test mode is a client " +
					"option and not an override, and v3 has no msa privacy signal. Send country, " +
					"region, language, and gpc instead; nothing was changed.",
			)
		}

		if (body.keys.none { it in OVERRIDE_INPUT_KEYS }) {
			return OverridesRead.Refused(
				REJECT_OVERRIDES,
				"the overrides document names none of country, region, language, or gpc, so " +
					"nothing was changed",
			)
		}

		if (body.containsKey("gpc") && body["gpc"] !== JsonNull && optBoolean(body["gpc"]) == null) {
			// `gpc` decides whether the GPC restriction applies, so a value this build
			// cannot read is refused rather than turned into either answer.
			return OverridesRead.Refused(
				REJECT_OVERRIDES,
				"the overrides document carries a gpc that is neither true, false, nor null, " +
					"so nothing was changed",
			)
		}

		return OverridesRead.Applied(
			KernelOverrides(
				country = if (body.containsKey("country")) optString(body["country"]) else current.country,
				region = if (body.containsKey("region")) optString(body["region"]) else current.region,
				language = if (body.containsKey("language")) optString(body["language"]) else current.language,
				gpc = when {
					!body.containsKey("gpc") -> current.gpc
					body["gpc"] === JsonNull -> null
					else -> optBoolean(body["gpc"])
				},
			),
		)
	}

	private fun encode(body: JsonObject): String = C15tJson.storage.encodeToString(JsonObject.serializer(), body)

	private fun parseObject(raw: String?): JsonObject? {
		if (raw.isNullOrBlank()) {
			return null
		}
		return try {
			C15tJson.wire.parseToJsonElement(raw).jsonObject
		} catch (_: Exception) {
			null
		}
	}

	private fun optString(element: JsonElement?): String? = (element as? JsonPrimitive)
		?.takeIf { it.isString }
		?.content

	private fun optBoolean(element: JsonElement?): Boolean? = (element as? JsonPrimitive)?.booleanOrNull

	private fun JsonObjectBuilder.putElement(
		key: String,
		value: String?,
	) {
		if (value == null) {
			put(key, JsonNull)
		} else {
			put(key, value)
		}
	}
}
