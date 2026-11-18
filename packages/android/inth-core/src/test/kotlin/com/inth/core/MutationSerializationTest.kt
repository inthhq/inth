package com.inth.core

import com.inth.core.model.*
import com.inth.core.iab.IabLegalBasis
import com.inth.core.spi.*
import com.inth.core.store.*
import com.inth.core.transport.*
import java.io.File
import java.util.concurrent.*
import kotlin.test.*
import kotlinx.serialization.json.*

class MutationSerializationTest {
	private val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "packages/native-protocol/iab/commit-cases.json") }.first { it.exists() }
	private val vector = Json { ignoreUnknownKeys = true }.decodeFromString<IabCommitTest.Vector>(file.readText())
	private val config = NativeConfig("https://cmp.example.test", iab = vector.cases[0].configuration)
	private fun init() = initSuccess(body = initBody(model = "\"iab\"",
		gvl = Json.parseToJsonElement(file.readText()).jsonObject["gvl"]!!.toString()))

	class BlockingStore : KeyValueStore {
		val underlying = InMemoryKeyValueStore()
		val entered = CountDownLatch(1)
		val resume = CountDownLatch(1)
		@Volatile var armed = false
		var refuse = false
		var callback: (() -> Unit)? = null
		override fun read(key: String) = underlying.read(key)
		override fun write(key: String, value: String?) = underlying.write(key, value)
		override fun flush() = Unit
		override fun writeDurably(key: String, value: String?): Boolean {
			if (armed && key == InthStoreKeys.SNAPSHOT) {
				armed = false
				callback?.invoke()
				entered.countDown()
				check(resume.await(10, TimeUnit.SECONDS))
				if (refuse) return false
			}
			return underlying.writeDurably(key, value)
		}
	}

	@Test fun `blocked commit leaves hot reads available and orders all mutations`() {
		for (operation in listOf("save", "identify", "logout", "reset", "overrides", "dismiss", "refresh")) {
			val backend = BlockingStore()
			val store = InthStore(backend)
			val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline"))
			val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
			core.bootstrap()
			core.identify(KernelUser("u1"))
			val base = core.snapshot()
			val pool = Executors.newCachedThreadPool()
			try {
				backend.armed = true
				val first = pool.submit<CommitResult> { core.save(CommitIntent.All, base.revision) }
				assertTrue(backend.entered.await(5, TimeUnit.SECONDS))
				val read = pool.submit {
					core.snapshot(); core.isAllowed(ConsentCategory.MARKETING); core.decision(ConsentCategory.MARKETING)
					core.iabConsent; core.isIabAllowed(1, 1, IabLegalBasis.CONSENT)
					core.gate(ConsentCategory.MARKETING) { _ -> }.close()
				}
				val readable = try { read.get(1, TimeUnit.SECONDS); true } catch (_: TimeoutException) { false }
				val second = pool.submit<CommitResult?> {
					when (operation) {
						"save" -> return@submit core.save(CommitIntent.Necessary, base.revision)
						"identify" -> core.identify(KernelUser("u2"))
						"logout" -> core.logout()
						"reset" -> core.reset()
						"overrides" -> core.setOverrides(KernelOverrides(language = "de"))
						"dismiss" -> core.dismissNotice()
						"refresh" -> core.refresh()
					}
					null
				}
				backend.resume.countDown()
				assertTrue(readable, "hot reads waited for disk: $operation")
				assertTrue(first.get(5, TimeUnit.SECONDS).ok)
				if (operation == "save") assertFalse(second.get(5, TimeUnit.SECONDS)!!.ok)
				else second.get(5, TimeUnit.SECONDS)
				assertEquals(core.snapshot().revision, store.readEnvelope()!!.snapshot.revision, operation)
				if (operation == "save") assertEquals(1, store.readPending().size)
				val cold = testKernel(config = config, store = InthStore(backend), clock = FixedClock(vector.now))
				cold.bootstrap()
				assertEquals(core.snapshot().explicitChoice, cold.snapshot().explicitChoice, operation)
			} finally {
				backend.resume.countDown()
				pool.shutdownNow()
			}
		}
	}

	@Test fun `storage callback reads and failed commit leave no ghost on restart`() {
		val backend = BlockingStore()
		val store = InthStore(backend)
		val core = testKernel(config = config, store = store,
			transport = RecordingTransport().respondInit(init()), clock = FixedClock(vector.now))
		core.bootstrap()
		val before = backend.read(InthStoreKeys.SNAPSHOT)
		val pool = Executors.newCachedThreadPool()
		val callbackCompleted = java.util.concurrent.atomic.AtomicBoolean(false)
		try {
			backend.callback = {
				val read = pool.submit { core.snapshot(); core.iabConsent; core.isIabAllowed(1, 1, IabLegalBasis.CONSENT) }
				read.get(1, TimeUnit.SECONDS)
				core.snapshot(); core.iabConsent; core.isIabAllowed(1, 1, IabLegalBasis.CONSENT)
				callbackCompleted.set(true)
			}
			backend.refuse = true
			backend.armed = true
			val save = pool.submit<CommitResult> { core.save(CommitIntent.All) }
			backend.resume.countDown()
			assertFalse(save.get(5, TimeUnit.SECONDS).ok)
			assertTrue(callbackCompleted.get(), "store callback read deadlocked")
			assertEquals(before, backend.read(InthStoreKeys.SNAPSHOT))
			assertTrue(store.readPending().isEmpty())
			val cold = testKernel(config = config, store = InthStore(backend), clock = FixedClock(vector.now))
			cold.bootstrap()
			assertNull(cold.iabConsent)
			assertTrue(store.readPending().isEmpty())
		} finally { backend.resume.countDown(); pool.shutdownNow() }
	}

	@Test fun `replacement and grant cleanup keep state reads available`() {
		for (operation in listOf("identify", "logout", "reset", "refresh")) {
			val backend = BlockingStore()
			val store = InthStore(backend)
			val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline"))
			val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
			core.bootstrap()
			core.identify(KernelUser("u1"))
			assertTrue(core.save(CommitIntent.All).ok)
			transport.respondInit(initSuccess(body = initBody(model = "\"iab\"",
				gvl = rawGvl().replace("\"vendorListVersion\":42", "\"vendorListVersion\":43"))))
			val pool = Executors.newCachedThreadPool()
			try {
				backend.armed = true
				val work = pool.submit {
					when (operation) {
						"identify" -> core.identify(KernelUser("u2"))
						"logout" -> core.logout()
						"reset" -> core.reset()
						"refresh" -> core.refresh()
					}
				}
				assertTrue(backend.entered.await(5, TimeUnit.SECONDS))
				val read = pool.submit { core.snapshot(); core.iabConsent; core.isIabAllowed(1, 1, IabLegalBasis.CONSENT) }
				val readable = try { read.get(1, TimeUnit.SECONDS); true } catch (_: TimeoutException) { false }
				backend.resume.countDown()
				assertTrue(readable, operation)
				work.get(5, TimeUnit.SECONDS)
				assertTrue(store.readPending().isEmpty(), operation)
			} finally { backend.resume.countDown(); pool.shutdownNow() }
		}
	}

	private fun rawGvl() = Json.parseToJsonElement(file.readText()).jsonObject["gvl"]!!.toString()

	@Test fun `failed commit orders following action without rejected body on restart`() {
		val backend = BlockingStore()
		val store = InthStore(backend)
		val core = testKernel(config = config, store = store, clock = FixedClock(vector.now),
			transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline")))
		core.bootstrap()
		val revision = core.snapshot().revision
		val pool = Executors.newCachedThreadPool()
		try {
			backend.refuse = true
			backend.armed = true
			val first = pool.submit<CommitResult> { core.save(CommitIntent.All, revision) }
			assertTrue(backend.entered.await(5, TimeUnit.SECONDS))
			val started = CountDownLatch(1)
			val second = pool.submit<CommitResult> { started.countDown(); core.save(CommitIntent.Necessary, revision) }
			assertTrue(started.await(1, TimeUnit.SECONDS))
			backend.resume.countDown()
			assertFalse(first.get(5, TimeUnit.SECONDS).ok)
			assertTrue(second.get(5, TimeUnit.SECONDS).ok)
			assertEquals(1, store.readPending().size)
			assertTrue(store.readPending().all { it.isWithdrawal() })
			val cold = testKernel(config = config, store = InthStore(backend), clock = FixedClock(vector.now))
			cold.bootstrap()
			assertEquals(core.iabConsent?.tcString, cold.iabConsent?.tcString)
		} finally { backend.resume.countDown(); pool.shutdownNow() }
	}
}
