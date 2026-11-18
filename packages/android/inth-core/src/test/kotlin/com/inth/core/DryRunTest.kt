package com.inth.core

import com.inth.core.gpp.GppOptions
import com.inth.core.gpp.GppStorageBusKeys
import com.inth.core.iab.IabConfiguration
import com.inth.core.model.ConsentCategory
import com.inth.core.model.KernelOverrides
import com.inth.core.model.KernelUser
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.store.TcBusValue
import com.inth.core.store.TcStorageBusKeys
import com.inth.core.tc.GlobalVendorList
import com.inth.core.tc.GlobalVendorListJson
import com.inth.core.transport.SaveOutcome
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/** `NativeConfig.dryRun`: consent works on the device and nothing is sent. */
class DryRunTest {
	private val dry = TEST_CONFIG.copy(dryRun = true)

	@Test fun `a dry-run save changes the snapshot and persists while nothing is queued or sent`() {
		val backend = InMemoryKeyValueStore()
		val store = InthStore(backend)
		val transport = RecordingTransport().respondInit(initSuccess())
		val logged = mutableListOf<String>()
		val snapshots = mutableListOf<Long>()
		val core = testKernel(dry, store, transport = transport, logger = { logged += it.code })
		core.bootstrap()
		core.onChange { snapshots += it.revision }
		assertEquals(1, transport.initRequests.size, "the hosted policy is still fetched")
		assertFalse(core.snapshot().policyPending)

		val result = core.save(CommitIntent.All)

		assertTrue(result.ok)
		assertFalse(result.queued, "a dry-run record is dropped, not queued")
		assertFalse(result.delivered)
		assertEquals(null, result.error)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(listOf(result.revision), snapshots, "observers hear about the save")
		assertTrue(store.readPending().isEmpty())
		assertTrue(transport.saveRequests.isEmpty())
		assertEquals(0, core.flushPending().remaining)
		assertEquals(listOf("dry-run"), logged, "one line says dryRun is on, and no error follows")

		// The decision is on disk: a cold start with no network still allows the category.
		val cold = testKernel(dry, InthStore(backend), transport = RecordingTransport(), executor = TaskExecutor { })
		cold.bootstrap()
		assertTrue(cold.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `dry-run identity calls change local state and send nothing`() {
		val transport = RecordingTransport().respondInit(initSuccess())
		val core = testKernel(dry, InthStore(InMemoryKeyValueStore()), transport = transport)
		core.bootstrap()

		core.identify(KernelUser(externalId = "user-1"), identityToken = "token-1")
		assertEquals("user-1", core.snapshot().subject?.externalId)
		core.logout()
		assertEquals(null, core.snapshot().subject?.externalId)

		assertTrue(transport.linkRequests.isEmpty(), "dryRun sends no link, even with a token")
		assertTrue(transport.saveRequests.isEmpty())
	}

	@Test fun `without dry-run only identify with a token reaches the transport`() {
		val transport = RecordingTransport().respondInit(initSuccess())
		val core = testKernel(TEST_CONFIG, InthStore(InMemoryKeyValueStore()), transport = transport)
		core.bootstrap()
		core.identify(KernelUser(externalId = "user-1"))
		assertTrue(transport.linkRequests.isEmpty(), "no token, no request")
		core.identify(KernelUser(externalId = "user-1"), identityToken = "token-1")
		core.logout()
		val subject = assertNotNull(core.snapshot().subject).id
		assertEquals(listOf(Triple(subject, "user-1", "token-1")), transport.linkRequests, "logout sends nothing")
	}

	@Test fun `an earlier queue is never flushed and a dry-run save drops it`() {
		val backend = InMemoryKeyValueStore()
		val earlier = testKernel(
			TEST_CONFIG, InthStore(backend),
			transport = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Unavailable("offline")),
		)
		earlier.bootstrap()
		assertTrue(earlier.save(CommitIntent.Necessary).queued)
		val owed = InthStore(backend).readPending()
		assertEquals(1, owed.size)

		val store = InthStore(backend)
		val transport = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Delivered())
		val core = testKernel(dry, store, transport = transport)
		core.bootstrap()
		val flushed = core.flushPending()
		assertEquals(0, flushed.delivered)
		assertEquals(1, flushed.remaining)
		assertEquals(owed, store.readPending())
		assertTrue(core.save(CommitIntent.All).ok)

		assertTrue(transport.saveRequests.isEmpty())
		// The old record cannot replay after the newer choice.
		assertTrue(store.readPending().isEmpty())
	}

	@Test fun `a dry-run save still writes the GPP string`() {
		val bus = RecordingTcStorageBus()
		val served = JsonObject(
			Json.parseToJsonElement(initBody(model = "\"opt-out\"")).jsonObject +
				("location" to JsonObject(mapOf("countryCode" to JsonPrimitive("US"), "regionCode" to JsonNull))),
		).toString()
		val transport = RecordingTransport().respondInit(initSuccess(body = served))
		val store = InthStore(InMemoryKeyValueStore(), tcStorageBus = bus)
		val core = testKernel(
			NativeConfig(
				"https://cmp.example.test",
				consentCategories = ConsentCategory.entries,
				overrides = KernelOverrides(country = "US"),
				gpp = GppOptions(),
				dryRun = true,
			),
			store, FixedClock(), transport,
		)
		core.bootstrap()
		val before = assertNotNull(core.snapshot().gppString)

		assertTrue(core.save(CommitIntent.Necessary).ok)

		val after = assertNotNull(core.snapshot().gppString)
		assertTrue(before != after, "the refusal changes the opt-out bits")
		assertEquals(TcBusValue.TextValue(after), bus.live[GppStorageBusKeys.HDR_GPP_STRING])
		assertTrue(transport.saveRequests.isEmpty())
		assertTrue(store.readPending().isEmpty())
	}

	@Test fun `a dry-run IAB save still writes the TC string`() {
		val fixture = Json.parseToJsonElement(
			generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
				.map { File(it, "packages/native-protocol/iab/commit-cases.json") }.first { it.exists() }.readText(),
		).jsonObject
		val reader = Json { ignoreUnknownKeys = true }
		val gvl = reader.decodeFromJsonElement<GlobalVendorList>(fixture.getValue("gvl"))
		val configuration = reader.decodeFromJsonElement<IabConfiguration>(
			fixture.getValue("cases").jsonArray[0].jsonObject.getValue("configuration"),
		)
		val now = (fixture.getValue("now") as JsonPrimitive).content.toLong()
		val bus = RecordingTcStorageBus()
		val store = InthStore(InMemoryKeyValueStore(), tcStorageBus = bus)
		val transport = RecordingTransport()
			.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = GlobalVendorListJson.toJson(gvl))))
		val core = testKernel(
			NativeConfig("https://cmp.example.test", iab = configuration, dryRun = true),
			store, FixedClock(now), transport,
		)
		core.bootstrap()

		val result = core.save(CommitIntent.All)

		assertTrue(result.ok)
		assertFalse(result.queued)
		val tcString = assertNotNull(core.iabConsent?.tcString)
		assertEquals(TcBusValue.TextValue(tcString), bus.live[TcStorageBusKeys.TC_STRING])
		assertTrue(transport.saveRequests.isEmpty())
		assertTrue(store.readPending().isEmpty())
	}
}
