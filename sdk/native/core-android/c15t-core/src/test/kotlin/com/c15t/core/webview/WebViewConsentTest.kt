package com.c15t.core.webview

import com.c15t.core.model.ConsentModel
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.ConsentState
import com.c15t.core.model.ConsentSubject
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The Kotlin half of "WebView consent" in `native/CONTRACT.md`. The scripts
 * themselves run in a browser in `@c15t/core` and `@c15t/browser` tests.
 */
class WebViewConsentTest {
	private fun root(path: String) = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, path) }.first { it.exists() }

	private val decided = ConsentSnapshot(
		revision = 7,
		policyPending = false,
		ready = true,
		model = ConsentModel.IAB,
		effectivePermissions = ConsentState(functionality = true, measurement = true),
		subject = ConsentSubject(id = "sub_should_not_cross", externalId = "user-1"),
	)

	@Test fun `origins normalize like every other platform`() {
		val cases = Json.parseToJsonElement(root("native/protocol/webview/origins.json").readText())
			.jsonObject.getValue("cases").jsonArray
		assertTrue(cases.size > 20)
		for (case in cases) {
			val input = case.jsonObject.getValue("input").jsonPrimitive.content
			val expected = case.jsonObject.getValue("origin").jsonPrimitive.contentOrNull
			assertEquals(expected, WebViewConsentScript.normalize(input), "origin for \"$input\"")
		}
	}

	@Test fun `the generated scripts are the protocol files`() {
		assertEquals(root("native/protocol/webview/document-start.js").readText().trim().removeSuffix(";"), WebViewConsentScripts.DOCUMENT_START)
		assertEquals(root("native/protocol/webview/update.js").readText().trim().removeSuffix(";"), WebViewConsentScripts.UPDATE)
	}

	@Test fun `a helper refuses an empty or unsafe origin list`() {
		assertFailsWith<IllegalArgumentException> { WebViewConsentScript(emptyList()) }
		assertFailsWith<IllegalArgumentException> { WebViewConsentScript(listOf("https://example.com", "http://example.com")) }
		assertFailsWith<IllegalArgumentException> { WebViewConsentScript(listOf("*")) }
		assertEquals(listOf("https://example.com"), WebViewConsentScript(listOf("https://example.com", "https://EXAMPLE.com:443/")).origins)
	}

	@Test fun `the state carries consent and nothing that identifies the subject`() {
		val json = WebViewConsentState.from(decided, tcString = "CQ-tc").toJson()
		assertFalse("sub_should_not_cross" in json)
		assertFalse("user-1" in json)
		val state = Json.parseToJsonElement(json).jsonObject
		assertEquals(setOf("version", "ready", "revision", "model", "permissions", "tcString", "gppString"), state.keys)
		assertEquals("iab", state.getValue("model").jsonPrimitive.content)
		assertEquals("CQ-tc", state.getValue("tcString").jsonPrimitive.content)
		assertEquals(JsonNull, state.getValue("gppString"))
		val permissions = state.getValue("permissions").jsonObject
		assertTrue(permissions.getValue("measurement").jsonPrimitive.boolean)
		assertFalse(permissions.getValue("marketing").jsonPrimitive.boolean)
	}

	@Test fun `nothing is granted before the core is ready`() {
		val pending = decided.copy(policyPending = true)
		val state = Json.parseToJsonElement(WebViewConsentState.from(pending, null).toJson()).jsonObject
		assertFalse(state.getValue("ready").jsonPrimitive.boolean)
		val permissions = state.getValue("permissions").jsonObject
		assertTrue(permissions.getValue("necessary").jsonPrimitive.boolean)
		for (category in listOf("functionality", "experience", "measurement", "marketing")) {
			assertFalse(permissions.getValue(category).jsonPrimitive.boolean, category)
		}
	}

	@Test fun `scripts call the protocol functions with the origins, the token and the state`() {
		val script = WebViewConsentScript(listOf("https://app.example"), token = "t0k3n")
		val state = WebViewConsentState.from(decided, null)
		assertEquals(
			"${WebViewConsentScripts.DOCUMENT_START}([\"https://app.example\"],\"t0k3n\",${state.toJson()});",
			script.documentStart(state),
		)
		assertEquals(
			"${WebViewConsentScripts.UPDATE}([\"https://app.example\"],\"t0k3n\",${state.toJson()});",
			script.update(state),
		)
	}

	@Test fun `every helper draws its own token`() {
		val first = WebViewConsentScript.newToken()
		assertEquals(32, first.length)
		assertTrue(first.all { it in '0'..'9' || it in 'a'..'f' })
		assertNotEquals(first, WebViewConsentScript.newToken())
	}

	@Test fun `only listed origins may ask for preferences`() {
		val script = WebViewConsentScript(listOf("https://app.example"))
		assertTrue(script.isAllowed("https://app.example"))
		assertTrue(script.isAllowed("https://app.example/"))
		assertFalse(script.isAllowed("https://evil.example"))
		assertFalse(script.isAllowed(null))
		assertTrue(WebViewConsentScript.isOpenPreferencesMessage("""{"type":"c15t:open-preferences"}"""))
		assertFalse(WebViewConsentScript.isOpenPreferencesMessage("""{"type":"c15t:save","all":true}"""))
	}
}
