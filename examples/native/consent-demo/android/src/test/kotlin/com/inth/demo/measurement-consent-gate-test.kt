package com.inth.demo

import android.os.Handler
import com.inth.core.Inth
import com.inth.core.CommitIntent
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelUser
import com.inth.core.model.QueuedSave
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.InthTransport
import com.inth.core.transport.InitContext
import com.inth.core.transport.LinkOutcome
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MeasurementConsentGateTest {
    @After fun cleanUp() {
        Handler.drain()
        Inth.uninstall()
    }

    @Test fun delayedGrantCannotEnableCollectionAfterCommittedRefusal() {
        Inth.bootstrap(
            NativeConfig(backendUrl = "https://example.test", consentCategories = ConsentCategory.entries),
            InthStore(MemoryStore()),
            executor = TaskExecutor.DIRECT,
            transport = object : InthTransport {
                override fun init(context: InitContext): TransportOutcome = TransportOutcome.Success(
                    Json.parseToJsonElement("""{"policyResolution":{"version":1,"status":"matched","policyId":"app-policy","matchedBy":"country","fingerprints":{"policy":"policy-1","choice":"choice-1","notice":"notice-1"},"policy":{"id":"app-policy","model":"opt-in","prompt":"choice","scopeMode":"permissive","rights":["disclosure","preferences"],"validity":{"choiceMs":2592000000,"noticeMs":15552000000}}},"policySnapshotToken":"snapshot-1"}"""),
                    emptyMap(),
                )
                override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable("offline")
                override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome = LinkOutcome.Linked(null)
            },
        )
        var refusedDuringGrant = false
        val refuseGrant: (ConsentSnapshot) -> Unit = { snapshot ->
            if (snapshot.isAllowed(ConsentCategory.MEASUREMENT)) {
                assertTrue(Inth.save(CommitIntent.Necessary).ok)
                refusedDuringGrant = true
            }
        }
        val observer = Inth.onChange(refuseGrant)
        val commands = mutableListOf<Boolean>()
        val gate = MeasurementConsentGate { commands += it }
        try {
            Handler.drain()
            assertTrue(Inth.save(CommitIntent.All).ok)
            assertTrue(refusedDuringGrant)
            assertFalse(Inth.isAllowed(ConsentCategory.MEASUREMENT))

            Handler.drain()

            assertFalse("Queued grant must not override current refusal: $commands", commands.last())
        } finally {
            gate.close()
            observer.close()
        }
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
