package com.inth.core

import com.inth.core.model.ActiveUI
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentModel
import com.inth.core.model.PolicyResolution
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import com.inth.core.transport.TransportOutcome
import com.inth.core.transport.InthProtocol
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Contract rule 5: unknown wire values fail closed. Each case here is a body a
 * hostile or mismatched backend could plausibly answer, and every one of them has
 * to end in the same deny-all state rather than an invented permission.
 */
class FailClosedTest {
	private fun bootstrapWith(body: String): ConsentCore {
		val transport = RecordingTransport().respondInit(initSuccess(body = body))
		return testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport).also { it.bootstrap() }
	}

	private fun assertDenyAll(kernel: ConsentCore) {
		val snapshot = kernel.snapshot()
		assertTrue(snapshot.policyPending, "an unreadable policy leaves the pending flag set")
		assertEquals(ActiveUI.NONE, snapshot.activeUI, "the first layer stays hidden")
		assertFalse(snapshot.promptRequirement.notice)
		assertEquals(ConsentModel.OPT_IN, snapshot.model, "the safe fallback is opt-in")
		for (category in ConsentCategory.OPTIONAL) {
			assertFalse(kernel.isAllowed(category), "$category must not be granted")
			assertFalse(snapshot.effectivePermissions[category])
		}
	}

	@Test
	fun `an unparseable policy resolution fails closed`() {
		assertDenyAll(bootstrapWith("""{"policyResolution":"not-even-an-object"}"""))
	}

	@Test
	fun `a matched resolution missing its fingerprints fails closed`() {
		val body = """{"policyResolution":{"status":"matched","policyId":"p",
			"policy":{"id":"p","model":"opt-in","prompt":"choice","validity":{"choiceMs":1000,"noticeMs":1000}}}}"""
		val kernel = bootstrapWith(body)
		assertDenyAll(kernel)
		assertEquals(PolicyResolution.REASON_INVALID_PAYLOAD, kernel.snapshot().resolution.reason)
	}

	@Test
	fun `an unknown category name in scope fails closed`() {
		val kernel = bootstrapWith(
			initBody(scope = """["measurement","something-invented"]"""),
		)
		assertDenyAll(kernel)
		assertNotNull(kernel.snapshot().error, "the host must be told why nothing is granted")
	}

	@Test
	fun `a model this build has never heard of fails closed`() {
		// `iab` reads and evaluates now (see KernelTest); a name from a newer schema does
		// not, and there is no default that could be guessed for it: a model the evaluator
		// has no rule for is exactly the case rule 5 refuses, because reading it as any of
		// the three it does know would invent permissions for a whole policy.
		assertDenyAll(bootstrapWith(initBody(model = "\"quantum-leibler\"")))
	}

	@Test
	fun `a missing choice window fails closed`() {
		assertDenyAll(
			bootstrapWith(
				"""{"policyResolution":{"status":"matched","policyId":"p",
					"fingerprints":{"policy":"pf","choice":"cf"},
					"policy":{"id":"p","model":"opt-in","prompt":"choice",
					"validity":{"noticeMs":1000}}}}""",
			)
		)
	}

	@Test
	fun `a producer on another policy contract is a configuration error`() {
		val transport = RecordingTransport().respondInit(
			initSuccess(InthProtocol.POLICY_CONTRACT_HEADER to "2"),
		)
		val kernel = testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport)
		kernel.bootstrap()

		assertDenyAll(kernel)
		assertEquals(
			PolicyResolution.REASON_UNSUPPORTED_CONTRACT,
			kernel.snapshot().resolution.reason,
			"a body under an unknown contract is not evidence",
		)
		val message = assertNotNull(kernel.snapshot().error).message
		assertTrue("contract" in message && "deny-all" in message, "got: $message")
	}

	@Test
	fun `an unparseable contract header fails closed`() {
		val transport = RecordingTransport().respondInit(
			initSuccess(InthProtocol.POLICY_CONTRACT_HEADER to "latest"),
		)
		val kernel = testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport)
		kernel.bootstrap()

		assertDenyAll(kernel)
		assertEquals(PolicyResolution.REASON_UNSUPPORTED_CONTRACT, kernel.snapshot().resolution.reason)
	}

	@Test
	fun `a negotiated producer with no policyResolution fails as an invalid payload`() {
		val transport = RecordingTransport().respondInit(
			initSuccess(
				InthProtocol.POLICY_CONTRACT_HEADER to InthProtocol.POLICY_CONTRACT_VERSION.toString(),
				body = """{"location":{"countryCode":"US"}}""",
			)
		)
		val kernel = testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport)
		kernel.bootstrap()

		assertDenyAll(kernel)
		assertEquals(PolicyResolution.REASON_INVALID_PAYLOAD, kernel.snapshot().resolution.reason)
	}

	@Test
	fun `a non-2xx init fails closed`() {
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			transport = RecordingTransport().respondInit(TransportOutcome.HttpFailure(503)),
		).also { it.bootstrap() }

		assertDenyAll(kernel)
		assertEquals(PolicyResolution.REASON_TRANSPORT, kernel.snapshot().resolution.reason)
	}

	@Test
	fun `a snapshot envelope that cannot be decoded reads as nothing stored`() {
		val backend = InMemoryKeyValueStore()
		backend.putSilently(InthStoreKeys.SNAPSHOT, """{"revision":1,"policyPending":""")
		val kernel = testKernel(store = InthStore(backend), transport = RecordingTransport())

		kernel.bootstrap()

		assertFalse(kernel.snapshot().ready, "a truncated write is the same as no state")
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))
	}
}
