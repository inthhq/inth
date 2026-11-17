package com.inth.reactnative

import com.inth.consentui.ConsentHostOutcome
import com.inth.consentui.ConsentHostPresentation
import com.inth.consentui.ConsentHostSession
import com.inth.core.CommitIntent
import com.inth.core.CommitResult
import com.inth.core.iab.AdTechProvider
import com.inth.core.iab.IabChoices
import com.inth.core.iab.IabCommittedConsent
import com.inth.core.iab.IabConfiguration
import com.inth.core.iab.IabDraft
import com.inth.core.iab.IabPresentation
import com.inth.core.iab.IabVendorDisclosure
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentLocation
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelError
import com.inth.core.model.KernelIabState
import com.inth.core.model.KernelOverrides
import com.inth.core.store.InthStore
import com.inth.core.tc.GlobalVendorList
import com.inth.core.tc.GvlLocalizedEntry
import com.inth.core.tc.GvlVendorEntry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * Every bridge payload this binding writes or reads, against
 * `packages/native-protocol/bridge/payloads.json`.
 *
 * The bridge carries JSON strings, so no compiler sees a key renamed on one side. That file
 * is generated from `src/protocol/bridge-schema.ts`, whose own type test holds the TypeScript
 * protocol types to it. Renaming a key here without renaming it there fails this test, and
 * the reverse fails the TypeScript one.
 */
class BridgeSchemaTest {
	private val json = Json

	private val payloads: JsonObject by lazy {
		json.parseToJsonElement(schemaFile().readText()).jsonObject["payloads"]!!.jsonObject
	}

	/** A snapshot with every headless IAB key filled, the disclosure included. */
	private fun iabSnapshot(): String {
		val list = GlobalVendorList(
			purposes = mapOf(1 to GvlLocalizedEntry(id = 1, name = "Store and/or access information on a device")),
			vendors = mapOf(755 to GvlVendorEntry(id = 755, name = "Vendor", purposes = listOf(1))),
			vendorListVersion = 177,
			tcfPolicyVersion = 5,
		)
		val choices = IabChoices(purposeConsents = listOf(1), vendorConsents = listOf(755))
		val presentation = IabPresentation(
			IabDraft(1, choices), list, mapOf(755 to IabVendorDisclosure(listOf(1), emptyList(), emptyList())),
			listOf(AdTechProvider(id = 89, name = "Provider", policyUrl = "https://provider.invalid/privacy")),
			canEdit = true, consentStorageMaxDays = 30,
		)
		val committed = IabCommittedConsent(
			configuration = IabConfiguration(cmpId = 9, cmpVersion = 1, publisherCountryCode = "DE"),
			choices = choices, subjectId = "sub", externalId = null, fingerprint = "fp", vendorListVersion = 177,
			policyVersion = 5, consentVersion = 1, createdAt = 1, actionAt = 1, tcString = "CQ-test",
		)
		return InthPayload.snapshot(ConsentSnapshot(iab = KernelIabState(list)), iabConsent = committed,
			iabAcceptAll = choices, iabPresentation = presentation)
	}

	@Test
	fun `every encoder writes the keys the schema declares`() {
		val kernel = bridgeKernel(InthStore(MemoryStore()))
		kernel.bootstrap()
		val saved = kernel.save(CommitIntent.All)
		val identified = ConsentSnapshot(
			subject = ConsentSubject(id = "sub_1", externalId = "user-1"),
			location = ConsentLocation(country = "DE"),
			error = KernelError("unsupported-contract", "producer speaks 2"),
		)

		val samples = listOf(
			"bootstrap" to InthPayload.bootstrap(kernel.snapshot(), kernel.hasStoredSnapshot),
			"snapshot" to InthPayload.snapshot(kernel.snapshot()),
			"snapshot" to InthPayload.snapshot(identified),
			"snapshot" to iabSnapshot(),
			"commitResult" to InthPayload.commitResult(saved, kernel.snapshot()),
			"commitResult" to InthPayload.commitResult(
				CommitResult(
					ok = false,
					revision = 4,
					confirmed = emptyMap(),
					queued = false,
					delivered = false,
					error = KernelError("policy-pending", "no policy yet"),
				),
				ConsentSnapshot(),
			),
			"commitResult" to InthPayload.invalidIntent("{\"action\":\"maybe\"}"),
			"commitResult" to InthPayload.notBootstrapped(),
			"trackingAuthorization" to InthPayload.trackingAuthorization(InthTrackingAuthorization.UNSUPPORTED),
			"snapshotEvent" to InthPayload.snapshotEvent(3),
			"initializedEvent" to InthPayload.initializedEvent(3),
			"errorEvent" to InthPayload.errorEvent(KernelError("transport-unavailable", "offline")),
			"presenterSession" to InthHostPayload.consentHostSession(ConsentHostSession.Presented("one", ConsentHostPresentation.PROMPT)),
			"presenterSession" to InthHostPayload.consentHostSession(ConsentHostSession.AlreadyPresented("one", ConsentHostPresentation.PREFERENCES)),
			"presenterSession" to InthHostPayload.consentHostSession(ConsentHostSession.NotRequired),
			"presenterOutcome" to InthHostPayload.consentHostOutcome(ConsentHostOutcome.Committed("one", 4)),
			"presenterOutcome" to InthHostPayload.consentHostOutcome(ConsentHostOutcome.Unavailable("one", 4)),
			"presenterPresented" to InthHostPayload.consentHostPresented("one", ConsentHostPresentation.PROMPT, automatic = true),
			"presenterUnavailable" to InthPayload.presenterUnavailable("INTH_PRESENTER_UNAVAILABLE", "no Activity yet"),
		)

		val problems = samples.flatMap { (name, raw) ->
			describe(fields(name), json.parseToJsonElement(raw).jsonObject, "$name.")
		}
		assertEquals("payloads that drifted from packages/native-protocol/bridge/payloads.json", emptyList<String>(), problems)

		// Optional keys are skipped when absent, so prove this binding can produce every
		// subject key the schema declares. A declared key no core models fails here.
		val subjectFields = fields("snapshot")["subject"]!!.jsonObject["fields"]!!.jsonObject
		val subject = json.parseToJsonElement(InthPayload.snapshot(identified)).jsonObject["subject"]!!.jsonObject
		assertEquals(subjectFields.keys, subject.keys)

		// Android sends neither of these: its tracking request rejects, and the stage only
		// exists on an Apple request. A payload added later must be covered here too.
		val covered = samples.map { it.first }.toSet() + setOf("trackingRequest") + jsToNative()
		assertEquals(payloads.keys, covered)
	}

	@Test
	fun `the commit intent decoder reads the keys the schema declares`() {
		val intent = fields("commitIntent")
		val consents = buildJsonObject {
			put("measurement", true)
			put("marketing", false)
		}
		// Every list a headless TCF draft names, empty: the shape, not a valid choice.
		val choices = buildJsonObject {
			for (list in listOf(
				"purposeConsents", "purposeLegitimateInterests", "purposeObjections",
				"vendorConsents", "vendorLegitimateInterests", "vendorObjections", "specialFeatureOptIns",
				"publisherConsents", "publisherLegitimateInterests", "publisherCustomConsents",
				"publisherCustomLegitimateInterests",
			)) put(list, JsonArray(emptyList()))
		}
		fun value(action: String, key: String, field: JsonObject): JsonElement = when (key) {
			"action" -> JsonPrimitive(action)
			"choices" -> choices
			"consents" -> consents
			"revision" -> JsonPrimitive(3)
			else -> throw AssertionError("commitIntent.$key has no sample here; add one")
		}.also { assertEquals(field["type"]!!.jsonPrimitive.content, kindOf(it)) }
		// `choices` belongs to an `iab` intent only; every other declared key is an explicit one's.
		val explicit = sample(JsonObject(intent.filterKeys { it != "choices" })) { key, field -> value("explicit", key, field) }
		val iab = sample(intent) { key, field -> value("iab", key, field) }

		assertEquals(
			CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true, ConsentCategory.MARKETING to false)),
			InthPayload.parseCommitIntent(explicit.toString()),
		)
		assertTrue("an iab intent with every declared key must decode", InthPayload.parseCommitIntent(iab.toString()) is CommitIntent.Iab)
		val actions = intent["action"]!!.jsonObject["values"]!!.jsonArray.map { it.jsonPrimitive.content }
		for (action in actions - "explicit" - "iab") {
			val parsed = InthPayload.parseCommitIntent(buildJsonObject { put("action", action) }.toString())
			assertTrue("action \"$action\" from the schema must decode", parsed != null)
		}
	}

	@Test
	fun `the auto-present settings decoder reads the keys the schema declares`() {
		val document = sample(fields("autoPresentSettings")) { key, _ ->
			when (key) {
				"autoPresent" -> JsonPrimitive(true)
				"privacyPolicyURL" -> JsonPrimitive("https://example.com/privacy")
				else -> throw AssertionError("autoPresentSettings.$key has no sample here; add one")
			}
		}
		assertEquals(
			InthPayload.AutoPresentSettings(true, "https://example.com/privacy"),
			InthPayload.parseAutoPresentSettings(document.toString()),
		)
		// The URL is nullable: a provider that turns auto-present off may have none.
		assertEquals(
			InthPayload.AutoPresentSettings(false, null),
			InthPayload.parseAutoPresentSettings("{\"autoPresent\":false,\"privacyPolicyURL\":null}"),
		)
		assertEquals(null, InthPayload.parseAutoPresentSettings("{\"autoPresent\":\"yes\"}"))
	}

	@Test
	fun `an intent that names a scope is refused, not widened`() {
		// Dropping `categories` would apply "all" to the whole choice scope, which is
		// more than a caller that scoped it asked for.
		for (raw in listOf(
			"{\"action\":\"all\",\"categories\":[\"measurement\"]}",
			"{\"action\":\"necessary\",\"categories\":[\"measurement\"]}",
			"{\"action\":\"explicit\",\"consents\":{\"measurement\":true},\"categories\":[\"measurement\"]}",
			// A bulk action carrying consents conflicts with itself.
			"{\"action\":\"all\",\"consents\":{\"marketing\":false}}",
			"{\"action\":\"necessary\",\"consents\":{\"marketing\":true}}",
		)) {
			assertEquals(raw, null, InthPayload.parseCommitIntent(raw))
		}
	}

	@Test
	fun `the overrides decoder reads the keys the schema declares`() {
		val document = sample(fields("overridesInput")) { key, _ ->
			when (key) {
				"country" -> JsonPrimitive("DE")
				"region" -> JsonPrimitive("BY")
				"language" -> JsonPrimitive("de")
				"gpc" -> JsonPrimitive(true)
				else -> throw AssertionError("overridesInput.$key has no sample here; add one")
			}
		}

		val read = InthPayload.parseOverrides(document.toString(), KernelOverrides())

		assertEquals(OverridesRead.Applied(KernelOverrides("DE", "BY", "de", true)), read)
		for (key in document.keys) {
			assertTrue(
				"overridesInput.$key alone must be read as an override",
				InthPayload.parseOverrides(buildJsonObject { put(key, document[key]!!) }.toString(), KernelOverrides()) is OverridesRead.Applied,
			)
		}
	}

	private fun fields(name: String): JsonObject =
		payloads[name]?.jsonObject?.get("fields")?.jsonObject ?: error("payloads.json declares no $name")

	private fun jsToNative(): Set<String> =
		payloads.filterValues { it.jsonObject["direction"]!!.jsonPrimitive.content == "js-to-native" }.keys

	/** A document that sets every declared key, so a decoder that reads another name misses it. */
	private fun sample(
		fields: JsonObject,
		value: (String, JsonObject) -> JsonElement,
	): JsonObject = JsonObject(fields.mapValues { (key, field) -> value(key, field.jsonObject) })

	/** One line per way [value] departs from [fields]; unknown keys count, since a rename is one. */
	private fun describe(
		fields: JsonObject,
		value: JsonObject,
		path: String,
	): List<String> {
		val problems = mutableListOf<String>()
		for ((key, raw) in fields) {
			val field = raw.jsonObject
			val at = "$path$key"
			val item = value[key]
			if (item == null) {
				if (field["required"]!!.jsonPrimitive.boolean) problems += "$at: required, absent"
				continue
			}
			if (item is JsonNull) {
				if (!field["nullable"]!!.jsonPrimitive.boolean) problems += "$at: null, not nullable"
				continue
			}
			val type = field["type"]!!.jsonPrimitive.content
			if (kindOf(item) != type) {
				problems += "$at: expected $type, found ${kindOf(item)}"
				continue
			}
			field["values"]?.jsonArray?.map { it.jsonPrimitive.content }?.let { values ->
				val text = item.jsonPrimitive.content
				if (text !in values) problems += "$at: \"$text\" is not one of $values"
			}
			val nested = field["fields"]?.jsonObject
			if (nested != null && nested.isNotEmpty()) {
				problems += describe(nested, item.jsonObject, "$at.")
			}
		}
		for (key in value.keys - fields.keys) {
			problems += "$path$key: not declared"
		}
		return problems
	}

	private fun kindOf(element: JsonElement): String = when (element) {
		is JsonObject -> "object"
		is JsonArray -> "array"
		JsonNull -> "null"
		is JsonPrimitive -> when {
			element.isString -> "string"
			element.booleanOrNull != null -> "boolean"
			else -> "number"
		}
	}

	/** Find `packages/native-protocol/bridge/payloads.json` by walking up, because Gradle may start anywhere. */
	private fun schemaFile(): File {
		var cursor: File? = File(System.getProperty("user.dir")).absoluteFile
		while (cursor != null) {
			val candidate = File(cursor, "packages/native-protocol/bridge/payloads.json")
			if (candidate.isFile) return candidate
			cursor = cursor.parentFile
		}
		fail("no packages/native-protocol/bridge/payloads.json above ${System.getProperty("user.dir")}. Run generate:bridge-schema.")
		error("unreachable")
	}
}
