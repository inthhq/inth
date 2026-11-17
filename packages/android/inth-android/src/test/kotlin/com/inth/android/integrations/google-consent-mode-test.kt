package com.inth.android.integrations

import com.inth.core.model.ConsentCategory
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The web's Consent Mode v2 mapping, through
 * `packages/native-protocol/google-consent-mode/consent-mode-v2.json`. Regenerate it with
 * `bun scripts/generate-google-consent-mode-fixture.ts`.
 */
class GoogleConsentModeTest {
	private val fixture: JsonObject by lazy {
		val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/google-consent-mode/consent-mode-v2.json") }
			.first { it.exists() }
		Json.parseToJsonElement(file.readText()).jsonObject
	}

	@Test
	fun `types and their categories match the web in order`() {
		val expected = fixture.getValue("types").jsonArray.map {
			it.jsonObject.getValue("type").jsonPrimitive.content to it.jsonObject.getValue("category").jsonPrimitive.content
		}
		assertEquals(expected, GoogleConsentType.entries.map { it.key to it.category.wireName })
	}

	@Test
	fun `mapping groups the types by category as the web does`() {
		val expected = fixture.getValue("mapping").jsonObject.map { (category, types) ->
			category to types.jsonArray.map { it.jsonPrimitive.content }
		}.toMap()
		assertEquals(expected, GoogleConsentMode.mapping.map { (category, types) -> category.wireName to types.map { it.key } }.toMap())
	}

	@Test
	fun `every consent combination sends what the web sends`() {
		val cases = fixture.getValue("cases").jsonArray.map { it.jsonObject }
		assertEquals(16, cases.size)
		for (case in cases) {
			val consents = case.getValue("consents").jsonObject
			val consent = GoogleConsentMode.consent { category: ConsentCategory ->
				consents.getValue(category.wireName).jsonPrimitive.boolean
			}
			val expected = case.getValue("expected").jsonObject.mapValues { it.value.jsonPrimitive.content }
			assertEquals(
				case.getValue("id").jsonPrimitive.content,
				expected,
				consent.entries.associate { (type, granted) -> type.key to if (granted) "granted" else "denied" },
			)
		}
	}
}
