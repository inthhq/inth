package com.c15t.core

import com.c15t.core.model.ConsentCategory
import com.c15t.core.store.C15tStore
import java.io.File
import java.util.Base64
import kotlinx.serialization.json.*
import kotlin.test.*

class IabUpgradeTest {
	@Test fun `exact legacy base bytes fail closed and allow pure withdrawal without config`() {
		val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/iab/legacy-category-store.json") }.first { it.exists() }
		val bytes = Json.parseToJsonElement(file.readText()).jsonObject
		val backend = InMemoryKeyValueStore()
		for ((key, value) in bytes) backend.write(key, String(Base64.getDecoder().decode(value.jsonPrimitive.content)))
		val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"")))
		val core = testKernel(store = C15tStore(backend), transport = transport, clock = FixedClock(1_758_100_060_000))
		core.bootstrap()
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		assertFalse(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
	}
}
