package com.c15t.reactnative

import com.c15t.consentui.ConsentHostOutcome
import com.c15t.consentui.ConsentHostPresentation
import com.c15t.consentui.ConsentHostSession
import com.c15t.core.CommitIntent
import com.c15t.core.CommitResult
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentLocation
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.ConsentSubject
import com.c15t.core.model.KernelError
import com.c15t.core.model.KernelOverrides
import com.c15t.core.store.C15tStore
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
 * `native/protocol/bridge/payloads.json`.
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

	@Test
	fun `every encoder writes the keys the schema declares`() {
		val kernel = bridgeKernel(C15tStore(MemoryStore()))
		kernel.bootstrap()
		val saved = kernel.save(CommitIntent.All)
		val identified = ConsentSnapshot(
			subject = ConsentSubject(id = "sub_1", externalId = "user-1"),
			location = ConsentLocation(country = "DE"),
			error = KernelError("unsupported-contract", "producer speaks 2"),
		)

		val samples = listOf(
			"bootstrap" to C15tPayload.bootstrap(kernel.snapshot(), kernel.hasStoredSnapshot),
			"snapshot" to C15tPayload.snapshot(kernel.snapshot()),
			"snapshot" to C15tPayload.snapshot(identified),
			"commitResult" to C15tPayload.commitResult(saved, kernel.snapshot()),
			"commitResult" to C15tPayload.commitResult(
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
			"commitResult" to C15tPayload.invalidIntent("{\"action\":\"maybe\"}"),
			"commitResult" to C15tPayload.notBootstrapped(),
			"trackingAuthorization" to C15tPayload.trackingAuthorization(C15tTrackingAuthorization.UNSUPPORTED),
			"snapshotEvent" to C15tPayload.snapshotEvent(3),
			"initializedEvent" to C15tPayload.initializedEvent(3),
			"errorEvent" to C15tPayload.errorEvent(KernelError("transport-unavailable", "offline")),
			"presenterSession" to C15tPayload.consentHostSession(ConsentHostSession.Presented("one", ConsentHostPresentation.PROMPT)),
			"presenterSession" to C15tPayload.consentHostSession(ConsentHostSession.AlreadyPresented("one", ConsentHostPresentation.PREFERENCES)),
			"presenterSession" to C15tPayload.consentHostSession(ConsentHostSession.NotRequired),
			"presenterOutcome" to C15tPayload.consentHostOutcome(ConsentHostOutcome.Committed("one", 4)),
			"presenterOutcome" to C15tPayload.consentHostOutcome(ConsentHostOutcome.Unavailable("one", 4)),
		)

		val problems = samples.flatMap { (name, raw) ->
			describe(fields(name), json.parseToJsonElement(raw).jsonObject, "$name.")
		}
		assertEquals("payloads that drifted from native/protocol/bridge/payloads.json", emptyList<String>(), problems)

		// Optional keys are skipped when absent, so prove this binding can produce every
		// subject key the schema declares. A declared key no core models fails here.
		val subjectFields = fields("snapshot")["subject"]!!.jsonObject["fields"]!!.jsonObject
		val subject = json.parseToJsonElement(C15tPayload.snapshot(identified)).jsonObject["subject"]!!.jsonObject
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
		val explicit = sample(intent) { key, field ->
			when (key) {
				"action" -> JsonPrimitive("explicit")
				"consents" -> consents
				else -> throw AssertionError("commitIntent.$key has no sample here; add one")
			}.also { assertEquals(field["type"]!!.jsonPrimitive.content, kindOf(it)) }
		}

		assertEquals(
			CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true, ConsentCategory.MARKETING to false)),
			C15tPayload.parseCommitIntent(explicit.toString()),
		)
		val actions = intent["action"]!!.jsonObject["values"]!!.jsonArray.map { it.jsonPrimitive.content }
		for (action in actions - "explicit") {
			val parsed = C15tPayload.parseCommitIntent(buildJsonObject { put("action", action) }.toString())
			assertTrue("action \"$action\" from the schema must decode", parsed != null)
		}
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
			assertEquals(raw, null, C15tPayload.parseCommitIntent(raw))
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

		val read = C15tPayload.parseOverrides(document.toString(), KernelOverrides())

		assertEquals(OverridesRead.Applied(KernelOverrides("DE", "BY", "de", true)), read)
		for (key in document.keys) {
			assertTrue(
				"overridesInput.$key alone must be read as an override",
				C15tPayload.parseOverrides(buildJsonObject { put(key, document[key]!!) }.toString(), KernelOverrides()) is OverridesRead.Applied,
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

	/** Find `native/protocol/bridge/payloads.json` by walking up, because Gradle may start anywhere. */
	private fun schemaFile(): File {
		var cursor: File? = File(System.getProperty("user.dir")).absoluteFile
		while (cursor != null) {
			val candidate = File(cursor, "native/protocol/bridge/payloads.json")
			if (candidate.isFile) return candidate
			cursor = cursor.parentFile
		}
		fail("no native/protocol/bridge/payloads.json above ${System.getProperty("user.dir")}. Run generate:bridge-schema.")
		error("unreachable")
	}
}
