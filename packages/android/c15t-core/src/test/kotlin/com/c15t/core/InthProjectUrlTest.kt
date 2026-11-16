package com.c15t.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The project URL rule, held to `native/protocol/project-url/cases.json`. */
class InthProjectUrlTest {
	private val fixture = Json.parseToJsonElement(
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/project-url/cases.json") }.first { it.exists() }.readText(),
	).jsonObject

	private fun cases(mode: String, kind: String): List<JsonObject> =
		fixture.getValue(mode).jsonObject.getValue(kind).jsonArray.map { it.jsonObject }

	private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content

	@Test fun `the allowed host suffixes are the fixture's`() {
		assertEquals(
			fixture.getValue("allowedHostSuffixes").jsonArray.map { it.jsonPrimitive.content },
			InthProjectUrl.ALLOWED_HOST_SUFFIXES,
		)
	}

	@Test fun `every strict and relaxed case normalizes as the fixture says`() {
		var checked = 0
		for ((mode, relaxed) in listOf("strict" to false, "relaxed" to true)) {
			for (case in cases(mode, "accept")) {
				val input = case.text("input")
				assertEquals(case.text("normalized"), InthProjectUrl.normalize(input, relaxed), "$mode accept \"$input\"")
				checked += 1
			}
		}
		assertTrue(checked > 0)
	}

	@Test fun `every strict and relaxed rejection carries the fixture's reason`() {
		val reasons = fixture.getValue("reasons").jsonObject.keys
		var checked = 0
		for ((mode, relaxed) in listOf("strict" to false, "relaxed" to true)) {
			for (case in cases(mode, "reject")) {
				val input = case.text("input")
				val error = assertFailsWith<InthProjectUrlException>("$mode reject \"$input\"") {
					InthProjectUrl.normalize(input, relaxed)
				}
				assertEquals(case.text("reason"), error.reason, "$mode reject \"$input\"")
				assertTrue(error.reason in reasons)
				checked += 1
			}
		}
		assertTrue(checked > 0)
	}

	@Test fun `the error names the option, the dashboard and the input as given`() {
		val error = assertFailsWith<InthProjectUrlException> { InthProjectUrl.normalize(" https://consent.example.com ") }
		assertEquals(
			"backendUrl must be the project URL from your Inth dashboard, such as https://your-project.inth.app. " +
				"Got \" https://consent.example.com \": the host must be a project host under inth.app.",
			error.message,
		)
	}

	@Test fun `strict is the default`() {
		assertEquals("host", assertFailsWith<InthProjectUrlException> { InthProjectUrl.normalize("https://localhost") }.reason)
	}
}
