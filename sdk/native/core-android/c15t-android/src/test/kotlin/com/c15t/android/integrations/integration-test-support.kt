package com.c15t.android.integrations

import com.c15t.core.CommitIntent
import com.c15t.core.ConsentCore
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
import org.junit.Assert.assertTrue

/** A native core on a direct executor whose `/init` answers an opt-in policy, or fails offline. */
internal fun kernel(store: MemoryStore = MemoryStore(), online: Boolean = true): ConsentCore =
	ConsentCore(
		config = NativeConfig(backendUrl = "https://example.test", consentCategories = ConsentCategory.entries),
		store = C15tStore(store),
		executor = TaskExecutor.DIRECT,
		transport = object : C15tTransport {
			override fun init(context: InitContext): TransportOutcome =
				if (online) TransportOutcome.Success(
					Json.parseToJsonElement("""{"policyResolution":{"version":1,"status":"matched","policyId":"app-policy","matchedBy":"country","fingerprints":{"policy":"policy-1","choice":"choice-1","notice":"notice-1"},"policy":{"id":"app-policy","model":"opt-in","prompt":"choice","scopeMode":"permissive","validity":{"choiceMs":2592000000,"noticeMs":15552000000}}},"policySnapshotToken":"snapshot-1"}"""),
					emptyMap(),
				) else TransportOutcome.NetworkFailure("offline")
			override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable("offline")
			override fun identify(subject: ConsentSubject, user: KernelUser): TransportOutcome = TransportOutcome.Success(null, emptyMap())
		},
	).also { it.bootstrap() }

internal class MemoryStore : KeyValueStore {
	private val values = mutableMapOf<String, String>()
	@Synchronized override fun read(key: String): String? = values[key]
	@Synchronized override fun write(key: String, value: String?) {
		if (value == null) values.remove(key) else values[key] = value
	}
	@Synchronized override fun writeDurably(key: String, value: String?): Boolean {
		write(key, value)
		return true
	}
	@Synchronized override fun keys(): Set<String> = values.keys.toSet()
	override fun flush() = Unit
}

/** Commit a custom choice and assert it committed. */
internal fun ConsentCore.choose(vararg categories: Pair<ConsentCategory, Boolean>) =
	assertTrue(save(CommitIntent.Custom(categories.toMap())).ok)

internal fun unexpectedError(error: Exception): Unit = throw AssertionError("Unexpected vendor failure", error)

internal val ADS_GRANTED = GoogleAdsConsent(adStorage = true, adUserData = true, adPersonalization = true)
internal val ADS_DENIED = GoogleAdsConsent(adStorage = false, adUserData = false, adPersonalization = false)

/** Take and clear the recorded calls. */
internal fun MutableList<String>.drain(): List<String> = toList().also { clear() }
