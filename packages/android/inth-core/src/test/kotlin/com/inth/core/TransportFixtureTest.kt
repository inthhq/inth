package com.inth.core

import com.inth.core.model.ConfirmedCoverage
import com.inth.core.model.ConsentAction
import com.inth.core.model.ConsentModel
import com.inth.core.model.ConsentState
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelOverrides
import com.inth.core.model.KernelUser
import com.inth.core.model.QueuedSave
import com.inth.core.model.SavePayload
import com.inth.core.spi.HttpResponse
import com.inth.core.transport.HostedTransport
import com.inth.core.transport.InitContext
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** [HostedTransport], held to `packages/native-protocol/transport/cases.json`, which the Swift core runs too. */
class TransportFixtureTest {
	private val fixture = Json.parseToJsonElement(
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/transport/cases.json") }.first { it.exists() }.readText(),
	).jsonObject

	private val config = NativeConfig(backendUrl = fixture.text("projectUrl")!!)

	private fun cases(key: String): List<JsonObject> =
		fixture.getValue(key).jsonArray.map { it.jsonObject }.also { assertTrue(it.isNotEmpty(), key) }

	private fun JsonObject.text(key: String): String? = (get(key) as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull

	private fun transport(answer: HttpResponse = HttpResponse(200, emptyMap(), "{}")) =
		RecordingHttpClient { answer }.let { http -> HostedTransport(http, config) to http }

	@Test
	fun `init goes to the fixture URL`() {
		for (case in cases("init")) {
			val overrides = case.getValue("overrides").jsonObject
			val (transport, http) = transport()
			val gpc = overrides["gpc"]?.jsonPrimitive?.booleanOrNull
			transport.init(
				InitContext(
					overrides = KernelOverrides(
						country = overrides.text("country"),
						region = overrides.text("region"),
						language = overrides.text("language"),
						gpc = gpc,
					),
					subject = null,
					gpc = gpc == true,
				),
			)
			val request = http.requests.single()
			assertEquals("GET", request.method, case.text("name"))
			assertEquals(case.text("url"), request.url, case.text("name"))
		}
	}

	@Test
	fun `records go to the fixture route`() {
		val records = fixture.getValue("records").jsonObject
		val (transport, http) = transport()
		transport.save(QueuedSave("q1", 0, payload(), body = "{}"))
		val request = http.requests.single()
		assertEquals(records.text("method"), request.method)
		assertEquals(records.text("url"), request.url)
		assertEquals("{}", request.body)
	}

	@Test
	fun `link sends the fixture URL and body`() {
		for (case in cases("link")) {
			val (transport, http) = transport()
			transport.link(
				ConsentSubject(case.text("subjectId")!!),
				KernelUser(case.text("externalId")!!, identityProvider = case.text("identityProvider")),
				case.text("identityToken")!!,
			)
			val request = http.requests.single()
			assertEquals(case.text("method"), request.method, case.text("name"))
			assertEquals(case.text("url"), request.url, case.text("name"))
			assertEquals(case.getValue("body"), Json.parseToJsonElement(request.body!!), case.text("name"))
		}
	}

	@Test
	fun `a 2xx names the fixture subject id`() {
		for (case in cases("success")) {
			val (transport, _) = transport(HttpResponse(200, emptyMap(), case.text("body")))
			assertEquals(
				SaveOutcome.Delivered(case.text("subjectId")),
				transport.save(QueuedSave("q1", 0, payload(), body = "{}")),
				case.text("name"),
			)
		}
	}

	@Test
	fun `a failure reads as the fixture says`() {
		for (case in cases("failure")) {
			val status = case.getValue("status").jsonPrimitive.int
			val headers = case.getValue("headers").jsonObject.mapValues { it.value.jsonPrimitive.content }
			val (transport, _) = transport(HttpResponse(status, headers, case.text("body")))
			val outcome = transport.save(QueuedSave("q1", 0, payload(), body = "{}"))
			assertEquals(
				SaveOutcome.Rejected(
					TransportOutcome.HttpFailure(status, case.text("code"), case.text("requestId"), case.text("message")),
				),
				outcome,
				case.text("name"),
			)
			assertEquals(case.getValue("permanent").jsonPrimitive.booleanOrNull, outcome.isPermanentlyRejected, case.text("name"))
		}
	}

	private fun payload() = SavePayload(
		subjectId = "019c1c38-a400-7100-8000-000000000002",
		subject = ConsentSubject("019c1c38-a400-7100-8000-000000000002"),
		choice = null,
		confirmed = ConfirmedCoverage(emptyMap(), 0),
		consents = ConsentState.DENY_ALL,
		overrides = KernelOverrides(),
		user = null,
		model = ConsentModel.OPT_IN,
		uiSource = null,
		consentAction = ConsentAction.NECESSARY,
		policySnapshotToken = null,
		givenAt = 0,
		idempotencyKey = "key-1",
	)
}
