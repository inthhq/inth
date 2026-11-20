package com.inth.core

import com.inth.core.model.ActiveUI
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelOverrides
import com.inth.core.model.OptOutHolder
import com.inth.core.model.OptOutMethod
import com.inth.core.model.OptOutRecord
import com.inth.core.model.OptOutRight
import com.inth.core.model.PromptRequirement
import com.inth.core.model.RestrictionReason
import com.inth.core.policy.PolicyEvaluator
import com.inth.core.store.InthJson
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import com.inth.core.store.SnapshotEnvelope
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Durable opt-out record behaviour not covered by the shared protocol fixtures:
 * commands, refusals, scope edge cases, timestamps, empty rights and strict decoding.
 */
class OptOutRecordTest {
	private val json = Json { ignoreUnknownKeys = false; explicitNulls = true }

	private fun optOutInit(
		scope: String = """["experience","functionality","marketing","measurement"]""",
		prompt: String = "\"none\"",
		gpcDenyCategories: String = """["marketing","measurement"]""",
		model: String = "\"opt-out\"",
	) = initSuccess(
		body = initBody(
			policyId = "us-ca-opt-out",
			model = model,
			prompt = prompt,
			scope = scope,
			scopeMode = "\"permissive\"",
			gpcDenyCategories = gpcDenyCategories,
		),
	)

	private fun seedOptOut(
		backend: InMemoryKeyValueStore,
		record: OptOutRecord,
		subjectId: String = "sub_2",
	) {
		backend.putSilently(
			InthStoreKeys.SUBJECT,
			InthJson.storage.encodeToString(ConsentSubject.serializer(), ConsentSubject(id = subjectId)),
		)
		backend.putSilently(
			InthStoreKeys.SNAPSHOT,
			InthJson.storage.encodeToString(
				SnapshotEnvelope.serializer(),
				SnapshotEnvelope(
					snapshot = ConsentSnapshot(
						subject = ConsentSubject(id = subjectId),
						optOut = record,
					),
				),
			),
		)
	}

	// -- optIn() refusals and lift --------------------------------------------

	@Test
	fun `optIn refuses with not-opted-out when no record is held`() {
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()
		val revisionBefore = kernel.snapshot().revision
		var notifications = 0
		kernel.onChange { notifications += 1 }

		val result = kernel.optIn()

		assertFalse(result.ok)
		assertEquals(OptInRefusalReason.NOT_OPTED_OUT, result.reason)
		assertEquals("not-opted-out", result.reason?.wireName)
		assertEquals(revisionBefore, result.revision)
		assertEquals(0, notifications)
	}

	@Test
	fun `optIn refuses with gpc-active while GPC is active under a rule that maps it`() {
		val clock = FixedClock(1_770_000_000_000L)
		val kernel = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(InMemoryKeyValueStore()),
			clock = clock,
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()
		val recorded = assertNotNull(kernel.snapshot().optOut)
		val revisionBefore = kernel.snapshot().revision

		val result = kernel.optIn()

		assertFalse(result.ok)
		assertEquals(OptInRefusalReason.GPC_ACTIVE, result.reason)
		assertEquals("gpc-active", result.reason?.wireName)
		assertEquals(revisionBefore, result.revision)
		assertEquals(recorded, kernel.snapshot().optOut)
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test
	fun `optIn refuses with held-by-account for person and both holders`() {
		for (holder in listOf(OptOutHolder.PERSON, OptOutHolder.BOTH)) {
			val backend = InMemoryKeyValueStore()
			val record = OptOutRecord(
				rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
				method = OptOutMethod.API,
				recordedAt = 1_770_000_000_000L,
				heldBy = holder,
			)
			seedOptOut(backend, record)
			val kernel = testKernel(
				store = InthStore(backend),
				transport = RecordingTransport().respondInit(optOutInit()),
			)
			kernel.bootstrap()
			val revisionBefore = kernel.snapshot().revision

			val result = kernel.optIn()

			assertFalse(result.ok, "holder $holder must not lift locally")
			assertEquals(OptInRefusalReason.HELD_BY_ACCOUNT, result.reason)
			assertEquals("held-by-account", result.reason?.wireName)
			assertEquals(revisionBefore, result.revision)
			assertEquals(record, kernel.snapshot().optOut)
		}
	}

	@Test
	fun `optIn reports gpc-active before held-by-account when both block`() {
		val backend = InMemoryKeyValueStore()
		seedOptOut(
			backend,
			OptOutRecord(
				rights = listOf(OptOutRight.SALE),
				method = OptOutMethod.PROPAGATED,
				recordedAt = 1_770_000_000_000L,
				heldBy = OptOutHolder.PERSON,
			),
		)
		val kernel = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()

		val result = kernel.optIn()

		assertFalse(result.ok)
		assertEquals(OptInRefusalReason.GPC_ACTIVE, result.reason)
	}

	@Test
	fun `optIn lifts a device-held record once GPC is off or unmapped and persists the lift`() {
		val backend = InMemoryKeyValueStore()
		val record = OptOutRecord(
			rights = emptyList(),
			method = OptOutMethod.GPC,
			recordedAt = 1_770_000_000_000L,
			heldBy = OptOutHolder.DEVICE,
		)
		seedOptOut(backend, record)
		val kernel = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(optOutInit(gpcDenyCategories = "[]")),
		)
		kernel.bootstrap()
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))

		val result = kernel.optIn()

		assertTrue(result.ok)
		assertNull(result.reason)
		assertNull(kernel.snapshot().optOut)
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
		assertTrue(kernel.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(emptyMap(), kernel.snapshot().restrictions)
		assertNull(assertNotNull(InthStore(backend).readEnvelope()).snapshot.optOut)
	}

	// -- optOut() command -----------------------------------------------------

	@Test
	fun `optOut records a button opt-out under an opt-out rule and acknowledges an owed notice`() {
		val clock = FixedClock(1_770_000_000_000L)
		val backend = InMemoryKeyValueStore()
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = RecordingTransport().respondInit(optOutInit(prompt = "\"notice\"")),
		)
		kernel.bootstrap()
		assertTrue(kernel.snapshot().promptRequirement.notice)

		val result = kernel.optOut()

		assertTrue(result.ok)
		assertTrue(result.changed)
		assertNull(result.reason)
		val expected = OptOutRecord(
			rights = emptyList(),
			method = OptOutMethod.BUTTON,
			recordedAt = clock.now,
			heldBy = OptOutHolder.DEVICE,
		)
		assertEquals(expected, result.optOut)
		assertEquals(expected, kernel.snapshot().optOut)
		assertEquals(PromptRequirement.NONE, kernel.snapshot().promptRequirement)
		assertEquals(ActiveUI.NONE, kernel.snapshot().activeUI)
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(listOf(RestrictionReason.OPT_OUT.wireName), kernel.snapshot().restrictions["marketing"])
		assertEquals(listOf(RestrictionReason.OPT_OUT.wireName), kernel.snapshot().restrictions["measurement"])
		assertEquals(expected, assertNotNull(InthStore(backend).readEnvelope()).snapshot.optOut)
	}

	@Test
	fun `optOut is a no-op when a record already exists`() {
		val clock = FixedClock(1_770_000_000_000L)
		val backend = InMemoryKeyValueStore()
		val existing = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.GPC,
			recordedAt = clock.now - 5_000L,
			heldBy = OptOutHolder.DEVICE,
		)
		seedOptOut(backend, existing)
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()
		val revisionBefore = kernel.snapshot().revision
		var notifications = 0
		kernel.onChange { notifications += 1 }
		clock.advance(10_000L)

		val result = kernel.optOut()

		assertTrue(result.ok)
		assertFalse(result.changed)
		assertNull(result.reason)
		assertEquals(existing, result.optOut)
		assertEquals(existing, kernel.snapshot().optOut)
		assertEquals(revisionBefore, result.revision)
		assertEquals(0, notifications)
	}

	@Test
	fun `optOut refuses with not-available outside an opt-out policy`() {
		val pending = testKernel(store = InthStore(InMemoryKeyValueStore()))
		pending.bootstrap()
		assertEquals(OptOutRefusalReason.NOT_AVAILABLE, pending.optOut().reason)
		assertNull(pending.snapshot().optOut)

		for (model in listOf("\"opt-in\"", "\"none\"")) {
			val prompt = if (model == "\"none\"") "\"none\"" else "\"choice\""
			val kernel = testKernel(
				store = InthStore(InMemoryKeyValueStore()),
				transport = RecordingTransport().respondInit(optOutInit(model = model, prompt = prompt)),
			)
			kernel.bootstrap()
			val result = kernel.optOut()
			assertFalse(result.ok, "model $model must refuse optOut()")
			assertEquals(OptOutRefusalReason.NOT_AVAILABLE, result.reason)
			assertEquals("not-available", result.reason?.wireName)
			assertNull(kernel.snapshot().optOut)
		}
	}

	// -- save() interactions --------------------------------------------------

	@Test
	fun `grant wins when a single save grants one opt-out category and refuses the other`() {
		val backend = InMemoryKeyValueStore()
		seedOptOut(
			backend,
			OptOutRecord(
				rights = listOf(OptOutRight.SALE),
				method = OptOutMethod.BUTTON,
				recordedAt = 1_770_000_000_000L,
				heldBy = OptOutHolder.DEVICE,
			),
		)
		val kernel = testKernel(
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()

		kernel.save(
			CommitIntent.Custom(
				mapOf(
					ConsentCategory.MARKETING to true,
					ConsentCategory.MEASUREMENT to false,
				),
			),
		)

		assertNull(kernel.snapshot().optOut, "the grant lifts the held opt-out and does not record a new one")
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(listOf("explicit-denial"), kernel.snapshot().restrictions["measurement"])
		assertNull(kernel.snapshot().restrictions["marketing"])
	}

	@Test
	fun `turning off marketing and measurement across two saves records on the second save`() {
		val clock = FixedClock(1_770_000_000_000L)
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			clock = clock,
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to false)))
		assertNull(kernel.snapshot().optOut, "refusing only one of two in-scope categories does not opt out yet")

		clock.advance(2_000L)
		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to false)))
		assertEquals(
			OptOutRecord(
				rights = emptyList(),
				method = OptOutMethod.BUTTON,
				recordedAt = clock.now,
				heldBy = OptOutHolder.DEVICE,
			),
			kernel.snapshot().optOut,
		)
	}

	@Test
	fun `granting save does not lift an account-held opt-out`() {
		val backend = InMemoryKeyValueStore()
		val record = OptOutRecord(
			rights = listOf(OptOutRight.SALE),
			method = OptOutMethod.API,
			recordedAt = 1_770_000_000_000L,
			heldBy = OptOutHolder.PERSON,
		)
		seedOptOut(backend, record)
		val kernel = testKernel(
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true)))

		assertEquals(record, kernel.snapshot().optOut)
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertEquals(listOf("opt-out"), kernel.snapshot().restrictions["marketing"])
	}

	// -- scope edge cases -----------------------------------------------------

	@Test
	fun `rule with only one opt-out category in scope restricts and triggers on that category alone`() {
		val clock = FixedClock(1_770_000_000_000L)
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			clock = clock,
			transport = RecordingTransport().respondInit(
				optOutInit(scope = """["functionality","marketing"]""", gpcDenyCategories = """["marketing"]"""),
			),
		)
		kernel.bootstrap()

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to false)))

		val expected = OptOutRecord(
			rights = emptyList(),
			method = OptOutMethod.BUTTON,
			recordedAt = clock.now,
			heldBy = OptOutHolder.DEVICE,
		)
		assertEquals(expected, kernel.snapshot().optOut)
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertTrue(kernel.isAllowed(ConsentCategory.MEASUREMENT), "out of scope under permissive mode")
		assertEquals(listOf("explicit-denial", "opt-out"), kernel.snapshot().restrictions["marketing"])
		assertNull(kernel.snapshot().restrictions["measurement"])
	}

	@Test
	fun `rule with neither marketing nor measurement in scope restricts nothing and save never records`() {
		val clock = FixedClock(1_770_000_000_000L)
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			clock = clock,
			transport = RecordingTransport().respondInit(
				optOutInit(scope = """["experience","functionality"]""", gpcDenyCategories = "[]"),
			),
		)
		kernel.bootstrap()

		kernel.save(CommitIntent.Necessary)
		assertNull(kernel.snapshot().optOut, "save never records an opt-out when neither category is in scope")

		val result = kernel.optOut()
		assertTrue(result.ok)
		assertTrue(result.changed)
		assertNotNull(kernel.snapshot().optOut)
		assertNull(kernel.snapshot().restrictions["marketing"])
		assertNull(kernel.snapshot().restrictions["measurement"])
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
		assertTrue(kernel.isAllowed(ConsentCategory.MEASUREMENT))
	}

	// -- automatic GPC opt-out & prompt suppression ---------------------------

	@Test
	fun `GPC turning on via setOverrides records once and survives when GPC turns off`() {
		val clock = FixedClock(1_770_000_000_000L)
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			clock = clock,
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()
		assertNull(kernel.snapshot().optOut)

		clock.advance(5_000L)
		val recordedAt = clock.now
		kernel.setOverrides(KernelOverrides(gpc = true))
		val expected = OptOutRecord(
			rights = emptyList(),
			method = OptOutMethod.GPC,
			recordedAt = recordedAt,
			heldBy = OptOutHolder.DEVICE,
		)
		assertEquals(expected, kernel.snapshot().optOut)
		assertEquals(listOf("gpc", "opt-out"), kernel.snapshot().restrictions["marketing"])

		clock.advance(5_000L)
		kernel.setOverrides(KernelOverrides(gpc = false))
		assertEquals(expected, kernel.snapshot().optOut, "record stays after GPC turns off")
		assertEquals(listOf("opt-out"), kernel.snapshot().restrictions["marketing"])
		assertEquals(listOf("opt-out"), kernel.snapshot().restrictions["measurement"])
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test
	fun `opt-out restriction suppresses automatic choice prompt under opt-in`() {
		val backend = InMemoryKeyValueStore()
		seedOptOut(
			backend,
			OptOutRecord(
				rights = listOf(OptOutRight.SALE),
				method = OptOutMethod.BUTTON,
				recordedAt = 1_770_000_000_000L,
				heldBy = OptOutHolder.DEVICE,
			),
		)
		val kernel = testKernel(
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(
				optOutInit(model = "\"opt-in\"", prompt = "\"choice\"", gpcDenyCategories = "[]"),
			),
		)
		kernel.bootstrap()

		assertEquals(PromptRequirement.NONE, kernel.snapshot().promptRequirement)
		assertEquals(ActiveUI.NONE, kernel.snapshot().activeUI)
		assertEquals(listOf("opt-out"), kernel.snapshot().restrictions["marketing"])
		assertEquals(listOf("opt-out"), kernel.snapshot().restrictions["measurement"])
	}

	// -- timestamps, empty rights, older envelopes and fail-closed decoding ---

	@Test
	fun `future recordedAt and empty rights are accepted and enforced`() {
		val clock = FixedClock(1_770_000_000_000L)
		val futureRecordedAt = clock.now + 365L * 86_400_000L
		val record = OptOutRecord(
			rights = emptyList(),
			method = OptOutMethod.BUTTON,
			recordedAt = futureRecordedAt,
			heldBy = OptOutHolder.DEVICE,
		)
		val backend = InMemoryKeyValueStore()
		seedOptOut(backend, record)
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()

		assertEquals(record, kernel.snapshot().optOut)
		assertEquals(futureRecordedAt, kernel.snapshot().optOut?.recordedAt)
		assertEquals(emptyList(), kernel.snapshot().optOut?.rights)
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertFalse(kernel.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(listOf(PolicyEvaluator.RESTRICTION_OPT_OUT), kernel.snapshot().restrictions["marketing"])
	}

	@Test
	fun `an older stored envelope without optOut decodes cleanly as null`() {
		val envelope = SnapshotEnvelope(
			snapshot = ConsentSnapshot(revision = 4, policyPending = false, ready = true),
		)
		val raw = InthJson.storage.encodeToString(SnapshotEnvelope.serializer(), envelope)
		val keyFragment = ""","optOut":null"""
		assertTrue(keyFragment in raw, "current build must write optOut: $raw")

		val older = raw.replace(keyFragment, "")
		val backend = InMemoryKeyValueStore(mapOf(InthStoreKeys.SNAPSHOT to older))
		val decoded = assertNotNull(InthStore(backend).readEnvelope())
		assertNull(decoded.snapshot.optOut)
	}

	@Test
	fun `decoding an unknown method, heldBy, right, duplicate right, negative timestamp or unknown key fails closed`() {
		val valid = SnapshotEnvelope(
			snapshot = ConsentSnapshot(
				revision = 2,
				policyPending = false,
				ready = true,
				subject = ConsentSubject(id = "sub_2"),
				optOut = OptOutRecord(
					rights = listOf(OptOutRight.SALE),
					method = OptOutMethod.BUTTON,
					recordedAt = 1_770_000_000_000L,
					heldBy = OptOutHolder.DEVICE,
				),
			),
		)
		val base = json.parseToJsonElement(
			InthJson.storage.encodeToString(SnapshotEnvelope.serializer(), valid),
		).jsonObject

		fun withOptOut(optOut: JsonObject): String {
			val snapshot = LinkedHashMap(base.getValue("snapshot").jsonObject).apply { put("optOut", optOut) }
			val root = LinkedHashMap(base).apply { put("snapshot", JsonObject(snapshot)) }
			return JsonObject(root).toString()
		}

		val badPayloads = listOf(
			"unknown method" to buildJsonObject {
				put("rights", json.parseToJsonElement("""["sale"]"""))
				put("method", "telepathy")
				put("recordedAt", 1_770_000_000_000L)
				put("heldBy", "device")
			},
			"unknown heldBy" to buildJsonObject {
				put("rights", json.parseToJsonElement("""["sale"]"""))
				put("method", "button")
				put("recordedAt", 1_770_000_000_000L)
				put("heldBy", "household")
			},
			"unknown right" to buildJsonObject {
				put("rights", json.parseToJsonElement("""["profiling"]"""))
				put("method", "button")
				put("recordedAt", 1_770_000_000_000L)
				put("heldBy", "device")
			},
			"duplicate right" to buildJsonObject {
				put("rights", json.parseToJsonElement("""["sale","sale"]"""))
				put("method", "button")
				put("recordedAt", 1_770_000_000_000L)
				put("heldBy", "device")
			},
			"negative recordedAt" to buildJsonObject {
				put("rights", json.parseToJsonElement("""[]"""))
				put("method", "button")
				put("recordedAt", -1L)
				put("heldBy", "device")
			},
			"unknown key" to buildJsonObject {
				put("rights", json.parseToJsonElement("""[]"""))
				put("method", "button")
				put("recordedAt", 1_770_000_000_000L)
				put("heldBy", "device")
				put("extra", JsonPrimitive(true))
			},
		)

		for ((label, payload) in badPayloads) {
			val raw = withOptOut(payload)
			val backend = InMemoryKeyValueStore(
				mapOf(
					InthStoreKeys.SUBJECT to InthJson.storage.encodeToString(
						ConsentSubject.serializer(),
						ConsentSubject(id = "sub_2"),
					),
					InthStoreKeys.SNAPSHOT to raw,
				),
			)
			assertNull(InthStore(backend).readEnvelope(), "$label must fail closed on read")

			val kernel = testKernel(store = InthStore(backend))
			kernel.bootstrap()
			assertTrue(kernel.snapshot().policyPending, "$label must leave bootstrap pending (deny-all)")
			assertFalse(kernel.snapshot().ready, "$label must leave bootstrap unready")
			assertNull(kernel.snapshot().optOut)
		}

		assertFailsWith<IllegalArgumentException> {
			OptOutRecord(
				rights = listOf(OptOutRight.SALE, OptOutRight.SALE),
				method = OptOutMethod.BUTTON,
				recordedAt = 0L,
				heldBy = OptOutHolder.DEVICE,
			)
		}
		assertFailsWith<IllegalArgumentException> {
			OptOutRecord(
				rights = emptyList(),
				method = OptOutMethod.BUTTON,
				recordedAt = -5L,
				heldBy = OptOutHolder.DEVICE,
			)
		}
	}

	@Test
	fun `reset clears a held durable opt-out record`() {
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			transport = RecordingTransport().respondInit(optOutInit()),
		)
		kernel.bootstrap()
		assertTrue(kernel.optOut().ok)
		assertNotNull(kernel.snapshot().optOut)

		kernel.reset()

		assertNull(kernel.snapshot().optOut)
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
		assertTrue(kernel.isAllowed(ConsentCategory.MEASUREMENT))
	}
}
