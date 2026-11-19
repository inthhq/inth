package com.inth.reactnative

import com.inth.core.ConsentCore
import com.inth.core.NativeConfig
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthJson
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** In-memory storage, so no test needs a device or a filesystem. */
internal class MemoryStore(
	initial: Map<String, String> = emptyMap(),
) : KeyValueStore {
	val data = LinkedHashMap(initial)

	override fun read(key: String): String? = data[key]

	// The map is the whole store, with nothing buffered, so every write is durable. The
	// SPI's default answers `false`, and the core refuses a consent write it cannot make
	// durable, so a store that forgets this override persists nothing.
	override fun writeDurably(key: String, value: String?): Boolean {
		write(key, value)
		return true
	}

	override fun keys(): Set<String> = data.keys.toSet()

	override fun write(
		key: String,
		value: String?,
	) {
		if (value == null) {
			data.remove(key)
		} else {
			data[key] = value
		}
	}
}

/**
 * A kernel wired the way the bridge runs one: local-only transport and inline task
 * execution, so a call is finished by the time it returns and ordering is assertable.
 *
 * @param config the config to bootstrap with, so a test can pin overrides or a detected
 * GPC signal the way a host app's manifest would.
 */
internal fun bridgeKernel(
	store: InthStore,
	config: NativeConfig = NativeConfig(backendUrl = "https://test.inth.app"),
): ConsentCore = ConsentCore(
	config = config,
	store = store,
	transport = com.inth.core.transport.InthTransport.NONE,
	executor = TaskExecutor.DIRECT,
)

/** Recorded `(event, payload)` pairs from a [InthChangePump]. */
internal class RecordingSink : InthEventSink {
	val events = mutableListOf<Pair<String, String>>()

	override fun emit(
		event: String,
		payload: String,
	) {
		events += event to payload
	}

	fun names(event: String): List<String> = events.filter { it.first == event }.map { it.second }
}

/**
 * Rewrite the stored envelope so its overrides carry [key], the way a build from
 * before the protocol was correction left them.
 *
 * The rest of the envelope stays what this build wrote, so the only difference a
 * reader can see is the retired name. That isolates the refusal: a test that failed
 * for some other reason would fail every other snapshot test too.
 */
internal fun sealWithRetiredOverride(
	backend: MemoryStore,
	key: String,
	value: String,
) {
	val raw = backend.data[InthStoreKeys.SNAPSHOT]
		requireNotNull(raw) { "the kernel persists an envelope once bootstrapped" }

	// The stored root is the envelope, so the overrides live two levels down. Patching
	// the wrong level would write a document that fails to decode for a different
	// reason, and the test would pass for the wrong one too.
	val envelope = InthJson.storage.parseToJsonElement(raw).jsonObject.toMutableMap()
	val snapshot = (envelope["snapshot"] as JsonObject).toMutableMap()
	val overrides = (snapshot["overrides"] as? JsonObject ?: JsonObject(emptyMap())).toMutableMap()
	overrides[key] = JsonPrimitive(value)
	snapshot["overrides"] = JsonObject(overrides)
	envelope["snapshot"] = JsonObject(snapshot)

	backend.data[InthStoreKeys.SNAPSHOT] = InthJson.storage.encodeToString(
		JsonObject.serializer(),
		JsonObject(envelope),
	)
}
