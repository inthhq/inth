package com.c15t.core

import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.spi.*
import com.c15t.core.store.*
import com.c15t.core.tc.*
import com.c15t.core.transport.*
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

class IabCommitTest {
	@Serializable
	data class Case(
		val id: String,
		val configuration: IabConfiguration,
		val choices: IabChoices,
		val tcString: String,
	)

	@Serializable
	data class Vector(
		val invalidChoices: List<IabChoices>,
		val invalidConfigurations: List<IabConfiguration>,
		val now: Long,
		val gvl: GlobalVendorList,
		val cases: List<Case>,
	)

	private val fixtureFile =
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/iab/commit-cases.json") }
			.first { it.exists() }
	private val vector =
		Json { ignoreUnknownKeys = true }.decodeFromString<Vector>(fixtureFile.readText())
	private val config
		get() = NativeConfig("https://cmp.example.test", iab = vector.cases[0].configuration)

	private fun transport() =
		RecordingTransport()
			.respondInit(
				initSuccess(
					body =
						initBody(model = "\"iab\"", gvl = GlobalVendorListJson.toJson(vector.gvl))
				)
			)
			.respondSave(SaveOutcome.Unavailable("offline"))

	private fun boot(
		store: C15tStore,
		config: NativeConfig = this.config,
		transport: RecordingTransport = transport(),
	): C15tKernel =
		testKernel(
				config = config,
				store = store,
				transport = transport,
				clock = FixedClock(vector.now),
			)
			.also { it.bootstrap() }

	@Test
	fun `category save cannot claim an IAB commit without CMP configuration`() {
		val core = boot(C15tStore(InMemoryKeyValueStore()), config.copy(iab = null))
		val result = core.save(CommitIntent.All)
		assertFalse(result.ok)
		assertEquals("iab-unavailable", result.error?.code)
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `shared choices generate reference strings and exact real HTTP bodies`() {
		for (row in vector.cases) {
			val store = C15tStore(InMemoryKeyValueStore())
			val core = boot(store, config.copy(iab = row.configuration))
			val result =
				core.save(
					CommitIntent.Iab(
						row.choices,
						mapOf(ConsentCategory.MARKETING to (row.id != "reject")),
					)
				)
			assertTrue(result.ok, row.id)
			val committed = assertNotNull(core.iabConsent)
			assertEquals(row.tcString, committed.tcString, row.id)
			assertEquals(row.choices, committed.choices, row.id)
			assertEquals(ConsentModel.IAB, core.snapshot().model)
			if (row.id == "restriction") assertTrue(core.isIabAllowed(2, 2, IabLegalBasis.CONSENT))
			if (row.id == "custom") {
				assertTrue(core.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
				assertFalse(core.isIabAllowed(2, 7, IabLegalBasis.LEGITIMATE_INTEREST))
			}
			val envelope = assertNotNull(store.readEnvelope())
			assertEquals(committed, envelope.iabConsent)
			val entry = assertNotNull(envelope.pendingSaves).single()
			val frozen = assertNotNull(entry.body)
			assertEquals(
				row.tcString,
				Json.parseToJsonElement(frozen).jsonObject["tcString"]?.jsonPrimitive?.content,
			)
			val client = RecordingHttpClient { HttpResponse(503, emptyMap(), "{}") }
			HostedTransport(client, config.copy(domain = "changed.example")).save(entry)
			assertEquals(frozen, client.requests.single().body)
			System.getenv("C15T_IAB_SAVE_EVIDENCE_DIR")?.let { path ->
				File(path).mkdirs()
				File(path, "kotlin-${row.id}.json").writeText(frozen)
			}
		}
	}

	@Test
	fun `file restart restores authority before background work and preserves retry bytes`() {
		val dir = Files.createTempDirectory("c15t-iab").toFile()
		try {
			val backend = FileBackend(dir)
			val first = boot(C15tStore(backend))
			assertTrue(
				first
					.save(
						CommitIntent.Iab(
							vector.cases[2].choices,
							mapOf(ConsentCategory.MARKETING to true),
						)
					)
					.ok
			)
			val before = C15tStore(backend).readPending().single().body
			val scheduled = mutableListOf<() -> Unit>()
			val http = transport()
			val coldStore = C15tStore(FileBackend(dir))
			val cold =
				testKernel(
					config = config,
					store = coldStore,
					transport = http,
					clock = FixedClock(vector.now),
					executor = TaskExecutor { scheduled += it },
				)
			cold.bootstrap()
			assertEquals(vector.cases[2].choices, cold.iabConsent?.choices)
			assertTrue(cold.isAllowed(ConsentCategory.MARKETING))
			cold.flushPending()
			assertTrue(http.saveRequests.isNotEmpty())
			assertTrue(http.saveRequests.all { it.body == before })
		} finally {
			dir.deleteRecursively()
		}
	}

	@Test
	fun `failed atomic write leaves snapshot authority and queue unchanged`() {
		val backend = FailingBackend()
		val store = C15tStore(backend)
		val core = boot(store)
		val before = core.snapshot()
		val bytes = backend.read(C15tStoreKeys.SNAPSHOT)
		backend.fail = true
		val result = core.save(CommitIntent.All)
		assertFalse(result.ok)
		assertEquals("queue-write-failed", result.error?.code)
		assertEquals(before, core.snapshot())
		assertEquals(bytes, backend.read(C15tStoreKeys.SNAPSHOT))
		assertNull(core.iabConsent)
		assertTrue(store.readPending().isEmpty())
	}

	@Test
	fun `withdrawal replaces queued grants and survives restart`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val core = boot(store)
		assertTrue(core.save(CommitIntent.All).ok)
		val grantAt = core.iabConsent!!.actionAt
		val createdAt = core.iabConsent!!.createdAt
		assertEquals(vector.cases[0].tcString, core.iabConsent?.tcString)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.iabConsent!!.actionAt > grantAt)
		assertEquals(createdAt, core.iabConsent!!.createdAt)
		assertEquals(vector.cases[1].tcString, core.iabConsent?.tcString)
		assertEquals(2, core.iabConsent?.consentVersion)
		assertEquals(IabChoices(), core.iabConsent?.choices)
		assertEquals(core.iabConsent?.tcString, store.readPending().single().payload.tcString)
		val cold = boot(store)
		assertEquals(IabChoices(), cold.iabConsent?.choices)
		assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `invalid choices and overlapping objections change nothing`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val core = boot(store)
		val revision = core.snapshot().revision
		for (choices in vector.invalidChoices) {
			assertEquals(
				"invalid-iab-choices",
				core.save(CommitIntent.Iab(choices, emptyMap())).error?.code,
			)
		}
		assertEquals(revision, core.snapshot().revision)
		assertTrue(store.readPending().isEmpty())
	}

	@Test
	fun `identity logout reset and failed transitions cannot restore a grant`() {
		for (operation in listOf("identify", "logout", "reset")) {
			val backend = FailingBackend()
			val store = C15tStore(backend)
			val core = boot(store)
			assertTrue(core.save(CommitIntent.All).ok)
			val granted = core.iabConsent
			val bytes = backend.read(C15tStoreKeys.SNAPSHOT)
			fun apply() {
				when (operation) {
					"identify" -> core.identify(KernelUser("next"))
					"logout" -> core.logout()
					else -> core.reset()
				}
			}
			backend.fail = true
			apply()
			assertEquals(granted, core.iabConsent)
			assertEquals(bytes, backend.read(C15tStoreKeys.SNAPSHOT))
			backend.fail = false
			apply()
			assertNull(core.iabConsent)
			assertTrue(store.readPending().isEmpty())
			assertFalse(core.isAllowed(ConsentCategory.MARKETING))
			val cold = boot(store)
			assertNull(cold.iabConsent)
			assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
			assertTrue(cold.save(CommitIntent.All).ok)
			assertTrue(cold.iabConsent!!.actionAt > granted!!.actionAt)
		}
	}

	@Test
	fun `concurrent commits keep only the latest durable decision and delivery`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val core = boot(store)
		val pool = Executors.newFixedThreadPool(4)
		val outcomes =
			(1..20).map { n ->
				pool.submit<CommitResult> {
					core.save(if (n % 2 == 0) CommitIntent.All else CommitIntent.Necessary)
				}
			}
		val committed = outcomes.count { it.get().ok }
		pool.shutdown()
		assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
		assertTrue(committed > 0)
		assertEquals(committed, core.iabConsent?.consentVersion)
		assertEquals(core.iabConsent, store.readEnvelope()?.iabConsent)
		assertEquals(core.iabConsent?.tcString, store.readPending().single().payload.tcString)
	}

	@Test
	fun `changed configuration tampering and stale drafts require a fresh choice`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val core = boot(store)
		val revision = core.snapshot().revision
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(
			"concurrent-change",
			core.save(CommitIntent.Necessary, expectedRevision = revision).error?.code,
		)
		val changed = config.copy(iab = config.iab!!.copy(cmpVersion = 8))
		val cold = boot(store, changed)
		assertNull(cold.iabConsent)
		assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
		assertTrue(store.readPending().isEmpty())
		assertTrue(cold.save(CommitIntent.All).ok)
		val old = store.readEnvelope()!!
		store.writeEnvelope(old.copy(iabConsent = old.iabConsent!!.copy(tcString = "invalid")))
		val tampered = boot(store, changed)
		assertNull(tampered.iabConsent)
		assertFalse(tampered.isAllowed(ConsentCategory.MARKETING))
		assertTrue(store.readPending().isEmpty())
	}

	@Test
	fun `invalid configuration cannot commit and expired state cannot replay`() {
		for (configuration in vector.invalidConfigurations) {
			val core = boot(C15tStore(InMemoryKeyValueStore()), config.copy(iab = configuration))
			assertEquals("invalid-iab-choices", core.save(CommitIntent.All).error?.code)
			assertNull(core.iabConsent)
			assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		}
		val store = C15tStore(InMemoryKeyValueStore())
		val first = boot(store)
		assertTrue(first.save(CommitIntent.All).ok)
		val transport = transport()
		val cold =
			testKernel(
				config = config,
				store = store,
				transport = transport,
				clock = FixedClock(vector.now + 31_536_000_001),
			)
		cold.bootstrap()
		assertNull(cold.iabConsent)
		assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
		assertFalse(cold.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
		cold.flushPending()
		assertTrue(transport.saveRequests.isEmpty())
	}

	@Test
	fun `caller mutations cannot change committed native authority`() {
		val purposes = mutableListOf(1, 2)
		val choices = IabChoices(purposeConsents = purposes, vendorConsents = listOf(1))
		val core = boot(C15tStore(InMemoryKeyValueStore()))
		assertTrue(core.save(CommitIntent.Iab(choices, emptyMap())).ok)
		purposes.clear()
		val returned = core.iabConsent!!
		(returned.choices.purposeConsents as MutableList).clear()
		assertEquals(listOf(1, 2), core.iabConsent?.choices?.purposeConsents)
		assertTrue(core.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
	}

	@Test
	fun `a buffered adapter disk failure is not a successful commit`() {
		val memory = InMemoryKeyValueStore()
		val backend =
			object : KeyValueStore {
				override fun read(key: String) = memory.read(key)

				override fun write(key: String, value: String?) = memory.write(key, value)

				override fun writeDurably(key: String, value: String?) = false
			}
		val core =
			boot(
				C15tStore(
					SubjectPreservingStore(
						ResilientKeyValueStore(backend, InMemoryKeyValueStore()),
						InMemoryKeyValueStore(),
					)
				)
			)
		val before = core.snapshot()
		assertEquals("queue-write-failed", core.save(CommitIntent.All).error?.code)
		assertEquals(before, core.snapshot())
		assertNull(core.iabConsent)
	}

	@Test
	fun `failed withdrawal keeps the last durable grant and body`() {
		val backend = FailingBackend()
		val store = C15tStore(backend)
		val core = boot(store)
		assertTrue(core.save(CommitIntent.All).ok)
		val before = core.snapshot()
		val authority = core.iabConsent
		val bytes = backend.read(C15tStoreKeys.SNAPSHOT)
		backend.fail = true
		assertEquals("queue-write-failed", core.save(CommitIntent.Necessary).error?.code)
		assertEquals(before, core.snapshot())
		assertEquals(authority, core.iabConsent)
		assertEquals(bytes, backend.read(C15tStoreKeys.SNAPSHOT))
		assertEquals(1, store.readPending().size)
	}

	private class FailingBackend : KeyValueStore {
		private val inner = InMemoryKeyValueStore()
		var fail = false

		override fun read(key: String) = inner.read(key)

		override fun write(key: String, value: String?) {
			if (!fail || key != C15tStoreKeys.SNAPSHOT) inner.write(key, value)
		}
	}

	private class FileBackend(val dir: File) : KeyValueStore {
		override fun read(key: String): String? = File(dir, key).takeIf { it.exists() }?.readText()

		override fun write(key: String, value: String?) {
			val target = File(dir, key)
			if (value == null) {
				target.delete()
				return
			}
			val temporary = File(dir, "$key.tmp")
			temporary.writeText(value)
			Files.move(
				temporary.toPath(),
				target.toPath(),
				StandardCopyOption.REPLACE_EXISTING,
				StandardCopyOption.ATOMIC_MOVE,
			)
		}
	}
}
