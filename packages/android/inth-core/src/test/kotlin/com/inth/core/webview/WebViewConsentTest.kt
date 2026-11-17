package com.inth.core.webview

import com.inth.core.model.ConsentModel
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentState
import com.inth.core.model.ConsentSubject
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The Kotlin half of "WebView consent" in `packages/native-protocol/CONTRACT.md`. The scripts
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
		val cases = Json.parseToJsonElement(root("packages/native-protocol/webview/origins.json").readText())
			.jsonObject.getValue("cases").jsonArray
		assertTrue(cases.size > 20)
		for (case in cases) {
			val input = case.jsonObject.getValue("input").jsonPrimitive.content
			val expected = case.jsonObject.getValue("origin").jsonPrimitive.contentOrNull
			assertEquals(expected, WebViewConsentScript.normalize(input), "origin for \"$input\"")
		}
	}

	@Test fun `the generated scripts are the protocol files`() {
		assertEquals(root("packages/native-protocol/webview/document-start.js").readText().trim().removeSuffix(";"), WebViewConsentScripts.DOCUMENT_START)
		assertEquals(root("packages/native-protocol/webview/update.js").readText().trim().removeSuffix(";"), WebViewConsentScripts.UPDATE)
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

	/** The GPP string the snapshot carries is the one the page receives, at document start and in every update. */
	@Test fun `the GPP string the snapshot carries reaches the injected payload`() {
		val state = WebViewConsentState.from(decided.copy(gppString = "DBABMA~CQ"), null)
		assertEquals("DBABMA~CQ", state.gppString)
		val script = WebViewConsentScript(listOf("https://app.example"), token = "t0k3n", requestKey = "k3y")
		assertTrue("\"gppString\":\"DBABMA~CQ\"" in script.documentStart(state))
		assertTrue("\"gppString\":\"DBABMA~CQ\"" in script.update(state))
	}

	@Test fun `a revoked state denies everything and carries no strings`() {
		val previous = WebViewConsentState.from(decided, tcString = "CQ-tc")
		val revoked = WebViewConsentState.revoked(previous)
		val state = Json.parseToJsonElement(revoked.toJson()).jsonObject
		assertFalse(state.getValue("ready").jsonPrimitive.boolean)
		assertEquals(JsonNull, state.getValue("tcString"))
		val permissions = state.getValue("permissions").jsonObject
		for (category in listOf("functionality", "experience", "measurement", "marketing")) {
			assertFalse(permissions.getValue(category).jsonPrimitive.boolean, category)
		}
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

	@Test fun `scripts call the protocol functions with the origins, the secrets and the state`() {
		val script = WebViewConsentScript(listOf("https://app.example"), token = "t0k3n", requestKey = "k3y")
		val state = WebViewConsentState.from(decided, null)
		assertEquals(
			"${WebViewConsentScripts.DOCUMENT_START}([\"https://app.example\"],\"t0k3n\",\"k3y\",${state.toJson()});",
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
	}

	@Test fun `a preferences request must carry the key only the top frame holds`() {
		val script = WebViewConsentScript(listOf("https://app.example"), requestKey = "k3y")
		assertTrue(script.isPreferencesRequest("""{"type":"c15t:open-preferences","key":"k3y"}"""))
		// What a frame that can post to the channel, but cannot read the key, can send.
		assertFalse(script.isPreferencesRequest("""{"type":"c15t:open-preferences"}"""))
		assertFalse(script.isPreferencesRequest("""{"type":"c15t:open-preferences","key":"guess"}"""))
		assertFalse(script.isPreferencesRequest(null))
	}

	@Test fun `a replacement keeps both secrets for the new origins`() {
		val first = WebViewConsentScript(listOf("https://app.example"), token = "t0k3n", requestKey = "k3y")
		val next = first.replacingOrigins(listOf("https://www.example.com"))
		val state = WebViewConsentState.from(decided, null)
		assertEquals(listOf("https://www.example.com"), next.origins)
		assertEquals(
			"${WebViewConsentScripts.UPDATE}([\"https://www.example.com\"],\"t0k3n\",${state.toJson()});",
			next.update(state),
		)
		assertTrue(next.isPreferencesRequest("""{"type":"c15t:open-preferences","key":"k3y"}"""))
	}
}
