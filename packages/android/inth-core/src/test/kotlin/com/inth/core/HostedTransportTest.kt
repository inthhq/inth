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
import com.inth.core.transport.LinkOutcome
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import kotlin.test.Test
import kotlin.test.assertEquals

/** The `/v1` wire of [HostedTransport]: routes, the init query, and the error body. */
class HostedTransportTest {
	private val config = NativeConfig(backendUrl = "https://acme.inth.app")

	@Test
	fun `init puts the device inputs in the query string, each only when set`() {
		fun urlFor(overrides: KernelOverrides, gpc: Boolean): String {
			val http = RecordingHttpClient { HttpResponse(200, emptyMap(), "{}") }
			HostedTransport(http, config).init(InitContext(overrides = overrides, subject = null, gpc = gpc))
			return http.requests.single().url
		}

		assertEquals("https://acme.inth.app/v1/consent/init", urlFor(KernelOverrides(), gpc = false))
		assertEquals(
			"https://acme.inth.app/v1/consent/init?country=US&region=US-CA&language=pt-BR&gpc=0",
			urlFor(KernelOverrides(country = "US", region = "US-CA", language = "pt-BR", gpc = false), gpc = false),
		)
		assertEquals("https://acme.inth.app/v1/consent/init?gpc=1", urlFor(KernelOverrides(), gpc = true))
	}

	@Test
	fun `a v1 error body gives the code, request id and message`() {
		val failure = saveAnswer(
			HttpResponse(
				409,
				mapOf("X-Request-Id" to "req_header"),
				"""{"error":{"code":"conflict","message":"already recorded","details":{}},"requestId":"req_body"}""",
			),
		)
		assertEquals(SaveOutcome.Rejected(409, "conflict", "req_body", "already recorded"), failure)
	}

	@Test
	fun `the request id falls back to the header and the message to the raw body`() {
		assertEquals(
			SaveOutcome.Rejected(502, null, "req_header", "<html>bad gateway</html>"),
			saveAnswer(HttpResponse(502, mapOf("x-request-id" to "req_header"), "<html>bad gateway</html>")),
		)
		assertEquals(SaveOutcome.Rejected(503, null, null, "HTTP 503"), saveAnswer(HttpResponse(503, emptyMap(), null)))
	}

	@Test
	fun `a records 200 is delivered with its subject id, whatever the link says`() {
		assertEquals(
			SaveOutcome.Delivered("019c1c38-a400-7100-8000-000000000002"),
			saveAnswer(
				HttpResponse(
					200,
					emptyMap(),
					"""{"subjectId":"019c1c38-a400-7100-8000-000000000002","recordId":"rec_1","link":{"stored":false,"reason":"invalid_token"}}""",
				),
			),
		)
		assertEquals(SaveOutcome.Delivered(null), saveAnswer(HttpResponse(200, emptyMap(), "")))
	}

	@Test
	fun `a refused link carries the backend code`() {
		val http = RecordingHttpClient {
			HttpResponse(401, emptyMap(), """{"error":{"code":"identity_token_invalid","message":"expired"},"requestId":"req_9"}""")
		}
		val outcome = HostedTransport(http, config).link(ConsentSubject("sub_2"), KernelUser("u1"), "t")
		assertEquals(LinkOutcome.Rejected(TransportOutcome.HttpFailure(401, "identity_token_invalid", "req_9", "expired")), outcome)
		assertEquals("https://acme.inth.app/v1/subjects/sub_2/link", http.requests.single().url)
	}

	@Test
	fun `a payload without a frozen body is built with the configured property, lowercased`() {
		val http = RecordingHttpClient { HttpResponse(200, emptyMap(), "{}") }
		HostedTransport(http, config.copy(property = "Com.Example.App")).save(QueuedSave("q1", 0, payload(), body = null))
		val body = kotlinx.serialization.json.Json.parseToJsonElement(http.requests.single().body!!)
		assertEquals("\"com.example.app\"", (body as kotlinx.serialization.json.JsonObject)["property"].toString())
		assertEquals("\"key-1\"", body["idempotencyKey"].toString())
	}

	private fun saveAnswer(response: HttpResponse): SaveOutcome {
		val http = RecordingHttpClient { response }
		return HostedTransport(http, config).save(QueuedSave("q1", 0, payload(), body = "{}"))
	}

	private fun payload() = SavePayload(
		subjectId = "sub_2",
		subject = ConsentSubject("sub_2"),
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
