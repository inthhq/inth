package com.c15t.demo

import android.os.Handler
import com.c15t.core.C15t
import com.c15t.core.CommitIntent
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentSnapshot
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MeasurementConsentGateTest {
    @After fun cleanUp() {
        Handler.drain()
        C15t.reset()
    }

    @Test fun delayedGrantCannotEnableCollectionAfterCommittedRefusal() {
        C15t.bootstrap(
            NativeConfig(portalUrl = "https://example.test", consentCategories = ConsentCategory.entries),
            C15tStore(MemoryStore()),
            executor = TaskExecutor.DIRECT,
            transport = object : C15tTransport {
                override fun init(context: InitContext): TransportOutcome = TransportOutcome.Success(
                    Json.parseToJsonElement("""{"policyResolution":{"version":1,"status":"matched","policyId":"app-policy","matchedBy":"country","fingerprints":{"policy":"policy-1","choice":"choice-1","notice":"notice-1"},"policy":{"id":"app-policy","model":"opt-in","prompt":"choice","scopeMode":"permissive","validity":{"choiceMs":2592000000,"noticeMs":15552000000}}},"policySnapshotToken":"snapshot-1"}"""),
                    emptyMap(),
                )
                override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable("offline")
                override fun identify(subject: ConsentSubject, user: KernelUser): TransportOutcome = TransportOutcome.Success(null, emptyMap())
            },
        )
        var refusedDuringGrant = false
        val refuseGrant: (ConsentSnapshot) -> Unit = { snapshot ->
            if (snapshot.isAllowed(ConsentCategory.MEASUREMENT)) {
                assertTrue(C15t.save(CommitIntent.Necessary).ok)
                refusedDuringGrant = true
            }
        }
        val observer = C15t.onChange(refuseGrant)
        val commands = mutableListOf<Boolean>()
        val gate = MeasurementConsentGate { commands += it }
        try {
            Handler.drain()
            assertTrue(C15t.save(CommitIntent.All).ok)
            assertTrue(refusedDuringGrant)
            assertFalse(C15t.isAllowed(ConsentCategory.MEASUREMENT))

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
