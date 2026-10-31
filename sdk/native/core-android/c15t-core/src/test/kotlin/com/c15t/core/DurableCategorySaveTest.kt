package com.c15t.core

import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.store.C15tStore
import com.c15t.core.store.C15tStoreKeys
import com.c15t.core.store.C15tJson
import com.c15t.core.store.PendingQueue
import com.c15t.core.store.SnapshotEnvelope
import com.c15t.core.transport.SaveOutcome
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DurableCategorySaveTest {
	private class RefusingSnapshotStore : KeyValueStore {
		val stored = InMemoryKeyValueStore()
		var refuseSnapshot = false
		var throwOnRefusal = false
		var beforeSnapshotWrite: (() -> Unit)? = null
		override fun read(key: String): String? = stored.read(key)
		override fun write(key: String, value: String?) = stored.write(key, value)
		override fun writeDurably(key: String, value: String?): Boolean {
			if (key == C15tStoreKeys.SNAPSHOT) {
				beforeSnapshotWrite?.invoke()
				if (refuseSnapshot) {
					if (throwOnRefusal) error("storage unavailable")
					return false
				}
			}
			return stored.writeDurably(key, value)
		}
	}

	@Test fun `refused category snapshot preserves the prior decision and never replays the grant`() {
		for (throws in listOf(false, true)) {
			val backend = RefusingSnapshotStore()
			val store = C15tStore(backend)
			val transport = RecordingTransport().respondInit(initSuccess())
				.respondSave(SaveOutcome.Unavailable("offline"))
			val core = testKernel(store = store, transport = transport)
			core.bootstrap()
			assertTrue(core.save(CommitIntent.Necessary).ok)
			val before = core.snapshot()
			val beforeBytes = backend.read(C15tStoreKeys.SNAPSHOT)
			val owed = store.readPending()
			val observed = mutableListOf<ConsentSnapshot>()
			val listener: (ConsentSnapshot) -> Unit = { observed += it }
			val subscription = core.onChange(listener)
			val duringWrite = mutableListOf<ConsentSnapshot>()
			backend.beforeSnapshotWrite = { duringWrite += core.snapshot() }
			backend.refuseSnapshot = true
			backend.throwOnRefusal = throws
			transport.saveRequests.clear()

			val result = core.save(CommitIntent.All)

			assertFalse(result.ok, "a refused snapshot cannot back a committed result")
			assertEquals("queue-write-failed", result.error?.code)
			assertFalse(result.queued)
			assertFalse(result.delivered)
			assertTrue(result.confirmed.isEmpty())
			assertEquals(before, core.snapshot())
			assertTrue(duringWrite.all { it == before }, "a pending disk write must not expose the grant")
			assertTrue(observed.isEmpty(), "a refused choice must not notify snapshot observers")
			assertEquals(beforeBytes, backend.read(C15tStoreKeys.SNAPSHOT))
			assertEquals(owed, store.readPending())
			assertTrue(transport.saveRequests.isEmpty())
			backend.beforeSnapshotWrite = null
			backend.refuseSnapshot = false
			val replay = RecordingTransport().respondInit(initSuccess())
			val cold = testKernel(store = C15tStore(backend), transport = replay)
			cold.bootstrap()
			cold.flushPending()
			assertEquals(before.explicitChoice, cold.snapshot().explicitChoice)
			assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
			assertEquals(owed.map { it.payload }, replay.saveRequests.map { it.payload })
			subscription.close()
		}
	}

	@Test fun `a custom store without durable acknowledgement refuses category saves`() {
		val cached = InMemoryKeyValueStore()
		val backend = object : KeyValueStore {
			override fun read(key: String): String? = cached.read(key)
			override fun write(key: String, value: String?) = cached.write(key, value)
		}
		val store = C15tStore(backend)
		val transport = RecordingTransport().respondInit(initSuccess())
		val core = testKernel(store = store, transport = transport)
		core.bootstrap()
		val before = core.snapshot()

		val result = core.save(CommitIntent.All)

		assertFalse(result.ok)
		assertEquals("queue-write-failed", result.error?.code)
		assertEquals(before, core.snapshot())
		assertTrue(store.readPending().isEmpty())
		assertTrue(transport.saveRequests.isEmpty())
	}

	@Test fun `refused category acknowledgement leaves the prompt unanswered`() {
		val backend = RefusingSnapshotStore()
		val store = C15tStore(backend)
		val transport = RecordingTransport().respondInit(initSuccess())
		val core = testKernel(config = TEST_CONFIG.copy(consentCategories = emptyList()),
			store = store, transport = transport)
		core.bootstrap()
		val before = core.snapshot()
		assertTrue(before.promptRequirement.acknowledge)
		backend.refuseSnapshot = true

		val result = core.save(CommitIntent.All)

		assertFalse(result.ok)
		assertEquals(before, core.snapshot())
		assertTrue(store.readPending().isEmpty())
		assertTrue(transport.saveRequests.isEmpty())
		backend.refuseSnapshot = false
		val cold = testKernel(config = TEST_CONFIG.copy(consentCategories = emptyList()),
			store = C15tStore(backend), transport = RecordingTransport().respondInit(initSuccess()))
		cold.bootstrap()
		assertTrue(cold.snapshot().promptRequirement.acknowledge)
		assertNotNull(store.readEnvelope())
	}

	@Test fun `category commit migrates legacy obligations and replays their frozen bodies unchanged`() {
		val backend = RefusingSnapshotStore()
		val store = C15tStore(backend)
		val transport = RecordingTransport().respondInit(initSuccess())
			.respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(store = store, transport = transport)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.Explicit(mapOf(ConsentCategory.MARKETING to true))).ok)
		val prior = store.readPending().single()
		val envelope = assertNotNull(store.readEnvelope())
		backend.write(C15tStoreKeys.SNAPSHOT,
			C15tJson.storage.encodeToString(SnapshotEnvelope.serializer(), envelope.copy(pendingSaves = null)))
		val legacy = C15tJson.queue.encodeToString(PendingQueue.serializer(), PendingQueue(listOf(prior)))
		backend.write(C15tStoreKeys.PENDING,
			legacy.replaceFirst("\"overrides\":{", "\"overrides\":{\"future\":true,"))
		assertEquals(prior, store.readPending().single(), "legacy queue fields remain tolerated")
		val before = core.snapshot()
		val duringWrite = mutableListOf<ConsentSnapshot>()
		backend.beforeSnapshotWrite = { duringWrite += core.snapshot() }

		assertTrue(core.save(CommitIntent.Explicit(mapOf(ConsentCategory.MEASUREMENT to true))).ok)

		assertEquals(before, duringWrite.first(), "authority must stay old until the durable write returns")
		backend.beforeSnapshotWrite = null
		val owed = store.readPending()
		assertEquals(2, owed.size)
		assertEquals(prior, owed.first(), "migration preserves the original row, payload and body")
		assertNotNull(store.readEnvelope()?.pendingSaves)
		val raw = assertNotNull(backend.read(C15tStoreKeys.SNAPSHOT))
		val queuedAt = raw.indexOf("\"pendingSaves\":")
		val changed = raw.take(queuedAt) + raw.substring(queuedAt)
			.replaceFirst("\"overrides\":{", "\"overrides\":{\"future\":true,")
		backend.write(C15tStoreKeys.SNAPSHOT, changed)
		assertEquals(owed, store.readPending(), "embedded queue fields have the legacy tolerance")
		val replay = RecordingTransport().respondInit(initSuccess())
		val cold = testKernel(store = C15tStore(backend), transport = replay)
		cold.bootstrap()
		cold.flushPending()
		assertEquals(owed.map { it.body }, replay.saveRequests.map { it.body })
		assertEquals(owed.map { it.payload }, replay.saveRequests.map { it.payload })
		assertTrue(cold.isAllowed(ConsentCategory.MARKETING))
		assertTrue(cold.isAllowed(ConsentCategory.MEASUREMENT))
		backend.write(C15tStoreKeys.SNAPSHOT,
			changed.replaceFirst("\"overrides\":{", "\"overrides\":{\"future\":true,"))
		val invalidAuthority = testKernel(store = C15tStore(backend))
		invalidAuthority.bootstrap()
		assertFalse(invalidAuthority.isAllowed(ConsentCategory.MARKETING),
			"unknown snapshot authority must still fail closed")
	}
}
