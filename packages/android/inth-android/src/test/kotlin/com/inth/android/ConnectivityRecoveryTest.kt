package com.c15t.android

import com.c15t.core.C15t
import com.c15t.core.CommitIntent
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentSubject
import com.c15t.core.model.KernelUser
import com.c15t.core.model.QueuedSave
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.C15tTransport
import com.c15t.core.transport.InitContext
import com.c15t.core.transport.SaveOutcome
import com.c15t.core.transport.TransportOutcome
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ConnectivityRecoveryTest {
	@Before
	fun clearInstalledCore() = C15t.uninstall()

	@After
	fun leaveNoInstalledCore() = C15t.uninstall()

	@Test
	fun `connectivity recovery replays the queue off callback thread and refreshes policy`() {
		val transport = RecordingTransport()
		C15t.bootstrap(
			NativeConfig(backendUrl = "https://example.test", consentCategories = listOf(ConsentCategory.MEASUREMENT)),
			C15tStore(MemoryStore()),
			transport = transport,
			executor = TaskExecutor { it() },
		)
		val result = C15t.save(CommitIntent.All)
		assertTrue("${result.error}", result.ok)
		val savesBefore = transport.saves
		val initsBefore = transport.inits
		transport.online = true
		val handed = mutableListOf<() -> Unit>()
		val gate = ReachabilityGate {
			C15tAndroid.onNetworkGained(TaskExecutor { handed.add(it) })
		}

		gate.onLost()
		gate.onAvailable()

		assertEquals("replay must leave the connectivity callback thread", savesBefore, transport.saves)
		assertEquals(1, handed.size)
		handed.single()()
		assertEquals(savesBefore + 1, transport.saves)
		assertEquals("online recovery must retry init without a foreground transition", initsBefore + 1, transport.inits)
	}

	private class RecordingTransport : C15tTransport {
		var inits = 0
		var saves = 0
		var online = false

		override fun init(context: InitContext): TransportOutcome {
			inits++
			return TransportOutcome.Success(
				Json.parseToJsonElement("""{"policyResolution":{"version":1,"status":"unconfigured","policy":null}}"""),
				emptyMap(),
			)
		}

		override fun save(entry: QueuedSave): SaveOutcome {
			saves++
			return if (online) SaveOutcome.Delivered else SaveOutcome.Unavailable("offline")
		}

		override fun identify(subject: ConsentSubject, user: KernelUser): TransportOutcome =
			TransportOutcome.Success(null, emptyMap())
	}

	private class MemoryStore : KeyValueStore {
		private val values = mutableMapOf<String, String>()
		override fun read(key: String): String? = values[key]
		override fun write(key: String, value: String?) {
			if (value == null) values.remove(key) else values[key] = value
		}
		override fun writeDurably(key: String, value: String?): Boolean {
			write(key, value)
			return true
		}
		override fun keys(): Set<String> = values.keys.toSet()
		override fun flush() = Unit
	}
}
