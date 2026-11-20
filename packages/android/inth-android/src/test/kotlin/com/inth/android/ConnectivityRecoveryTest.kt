package com.inth.android

import com.inth.core.Inth
import com.inth.core.CommitIntent
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelUser
import com.inth.core.model.QueuedSave
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.InthTransport
import com.inth.core.transport.InitContext
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ConnectivityRecoveryTest {
	@Before
	fun clearInstalledCore() = Inth.uninstall()

	@After
	fun leaveNoInstalledCore() = Inth.uninstall()

	@Test
	fun `connectivity recovery replays the queue off callback thread and refreshes policy`() {
		val transport = RecordingTransport()
		Inth.bootstrap(
			NativeConfig(backendUrl = "https://example.test", consentCategories = listOf(ConsentCategory.MEASUREMENT)),
			InthStore(MemoryStore()),
			transport = transport,
			executor = TaskExecutor { it() },
		)
		val result = Inth.save(CommitIntent.All)
		assertTrue("${result.error}", result.ok)
		val savesBefore = transport.saves
		val initsBefore = transport.inits
		transport.online = true
		val handed = mutableListOf<() -> Unit>()
		val gate = ReachabilityGate {
			InthAndroid.onNetworkGained(TaskExecutor { handed.add(it) })
		}

		gate.onLost()
		gate.onAvailable()

		assertEquals("replay must leave the connectivity callback thread", savesBefore, transport.saves)
		assertEquals(1, handed.size)
		handed.single()()
		assertEquals(savesBefore + 1, transport.saves)
		assertEquals("online recovery must retry init without a foreground transition", initsBefore + 1, transport.inits)
	}

	private class RecordingTransport : InthTransport {
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
			return if (online) SaveOutcome.Delivered() else SaveOutcome.Unavailable("offline")
		}

		override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): com.inth.core.transport.LinkOutcome =
			com.inth.core.transport.LinkOutcome.Unavailable("offline")
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
