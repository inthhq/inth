package com.inth.core

import com.inth.core.model.ConfirmedCoverage
import com.inth.core.model.ConsentAction
import com.inth.core.model.ConsentModel
import com.inth.core.model.ConsentState
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelOverrides
import com.inth.core.model.QueuedSave
import com.inth.core.model.SavePayload
import com.inth.core.spi.HttpResponse
import com.inth.core.transport.HostedTransport
import kotlin.test.Test
import kotlin.test.assertEquals

/** What [HostedTransport] builds for a queued entry that has no frozen body. */
class HostedTransportTest {
	@Test
	fun `a payload without a frozen body is built with the configured property, lowercased`() {
		val http = RecordingHttpClient { HttpResponse(200, emptyMap(), "{}") }
		val config = NativeConfig(backendUrl = "https://acme.inth.app", property = "Com.Example.App")
		HostedTransport(http, config).save(QueuedSave("q1", 0, payload(), body = null))
		val body = kotlinx.serialization.json.Json.parseToJsonElement(http.requests.single().body!!)
		assertEquals("\"com.example.app\"", (body as kotlinx.serialization.json.JsonObject)["property"].toString())
		assertEquals("\"key-1\"", body["idempotencyKey"].toString())
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
