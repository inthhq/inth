package com.inth.android.integrations

import com.inth.core.CommitIntent
import com.inth.core.ConsentCore
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
import org.junit.Assert.assertTrue

/** A native core on a direct executor whose `/init` answers an opt-in policy, or fails offline. */
internal fun kernel(store: MemoryStore = MemoryStore(), online: Boolean = true): ConsentCore =
	ConsentCore(
		config = NativeConfig(backendUrl = "https://example.test", consentCategories = ConsentCategory.entries),
		store = InthStore(store),
		executor = TaskExecutor.DIRECT,
		transport = object : InthTransport {
			override fun init(context: InitContext): TransportOutcome =
				if (online) TransportOutcome.Success(
					Json.parseToJsonElement("""{"policyResolution":{"version":1,"status":"matched","policyId":"app-policy","matchedBy":"country","fingerprints":{"policy":"policy-1","choice":"choice-1","notice":"notice-1"},"policy":{"id":"app-policy","model":"opt-in","prompt":"choice","scopeMode":"permissive","rights":["disclosure","preferences"],"validity":{"choiceMs":2592000000,"noticeMs":15552000000}}},"policySnapshotToken":"snapshot-1"}"""),
					emptyMap(),
				) else TransportOutcome.NetworkFailure("offline")
			override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable("offline")
			override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): com.inth.core.transport.LinkOutcome =
				com.inth.core.transport.LinkOutcome.Unavailable("offline")
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
