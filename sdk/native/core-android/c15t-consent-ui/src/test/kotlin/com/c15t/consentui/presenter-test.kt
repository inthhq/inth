package com.c15t.consentui

import com.c15t.core.*
import com.c15t.core.iab.*
import com.c15t.core.spi.*
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import com.c15t.core.model.ConsentCategory
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

@OptIn(ExperimentalCoroutinesApi::class)
class PresenterTest {
    private class Memory : KeyValueStore {
        @Volatile var refuseNext = false
        /** When set, the next decision write waits on it, so a test can look at the presenter mid-commit. */
        @Volatile var holdNext: java.util.concurrent.CountDownLatch? = null
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean {
            if (key == "com.c15t.snapshot") {
                holdNext?.let { holdNext = null; it.await(5, TimeUnit.SECONDS) }
                if (refuseNext) { refuseNext = false; return false }
            }
            write(key, value); return true
        }
    }
    private fun boot(store: Memory = Memory()): Pair<C15tKernel, AtomicLong> {
        val now = AtomicLong(System.currentTimeMillis())
        val body = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "native/examples/consent-demo/fixtures/iab-init.json") }.first { it.exists() }.readText()
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), body) else HttpResponse(503)
        }
        val config = NativeConfig("https://fixture.invalid", iab = IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB"), iabListMaxAgeMs = 60_000)
        val core = C15tKernel(config, C15tStore(store), clock = Clock { now.get() },
            transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
        core.bootstrap()
        return core to now
    }
    @Test fun retryPreservesDirtyExpiredListDraftUntilExplicitReload() {
        val mainDispatcher = StandardTestDispatcher()
        Dispatchers.setMain(mainDispatcher)
        try {
            val (core, clock) = boot()
            val p = ConsentPresenter(core)
            p.customize()
            p.edit { it.copy(purposeConsents = listOf(7)) }
            val choices = p.choices
            clock.addAndGet(60_001)
            assertTrue(p.listUnavailable)
            val revision = p.snapshot.revision
            p.refresh()
            assertTrue(p.dirty)
            assertEquals(choices, p.choices)
            // Observe the completed main-thread update, not the core's earlier list refresh.
            await {
                mainDispatcher.scheduler.runCurrent()
                p.snapshot.revision > revision && !p.listUnavailable
            }
            assertTrue(p.stale)
            assertTrue(p.dirty)
            assertEquals(choices, p.choices)
            p.loadDraft()
            assertFalse(p.stale)
            assertFalse(p.dirty)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun expiredListReopenKeepsReadablePartnersAndRefusesNewGrants() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val (core, clock) = boot()
            val vendors = core.iabPresentation()!!.vendors
            clock.addAndGet(60_001)
            val p = ConsentPresenter(core)
            p.presentPreferences()
            assertEquals(vendors, p.disclosure?.vendors)
            assertEquals(false, p.disclosure?.canEdit)
            assertTrue(p.listUnavailable)
            assertNull(core.openIabDraft())
            assertFalse(core.save(CommitIntent.All).ok)
            assertFalse(core.snapshot().effectivePermissions.marketing)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun partnerStatusIncludesSavedLIAndDistinguishesPartialSelection() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val (core, _) = boot()
            val p = ConsentPresenter(core)
            p.customize()
            assertEquals("Off", p.partnerStatus(1))
            p.edit { it.copy(purposeLegitimateInterests = listOf(7), vendorLegitimateInterests = listOf(1)) }
            p.commit(ConsentPresenter.Action.SAVE)
            await { !p.pending }
            assertNull(p.errorCode)
            assertTrue(core.isIabAllowed(1, 7, IabLegalBasis.LEGITIMATE_INTEREST))
            p.presentPreferences()
            assertEquals("Partly on", p.partnerStatus(1))
            p.edit { it.copy(vendorConsents = listOf(1), purposeConsents = listOf(1, 3, 4, 7)) }
            assertEquals("On", p.partnerStatus(1))
            p.edit { it.copy(purposeObjections = listOf(7)) }
            assertEquals("Partly on", p.partnerStatus(1))
            p.edit { it.copy(vendorConsents = emptyList()) }
            assertEquals("Off", p.partnerStatus(1))
        } finally { Dispatchers.resetMain() }
    }
    @Test fun refusedWriteKeepsDraftAndRetryEmitsOneOutcome() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val store = Memory()
            val (core, _) = boot(store)
            val p = ConsentPresenter(core, automaticPresentation = false)
            p.presentPreferences()
            val session = p.presentationID
            var outcomes = 0
            p.onOutcome = { outcomes++ }
            p.edit { it.copy(purposeConsents = listOf(7), vendorConsents = listOf(1)) }
            store.refuseNext = true
            p.commit(ConsentPresenter.Action.SAVE)
            await { !p.pending }
            assertNotNull(p.errorCode)
            assertEquals(session, p.presentationID)
            assertEquals(listOf(7), p.choices.purposeConsents)
            assertNull(core.iabConsent)
            assertEquals(0, outcomes)
            p.retry()
            await { !p.pending }
            assertNull(p.errorCode)
            assertTrue(core.isIabAllowed(1, 7, IabLegalBasis.CONSENT))
            assertEquals(1, outcomes)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun openSettingsCanWithdrawAfterBundledPolicyExpires() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val vector = Json.parseToJsonElement(generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
                .map { File(it, "native/protocol/bundled-policy/parity.json") }.first { it.exists() }.readText()).jsonObject
            val clock = AtomicLong(vector.getValue("now").jsonPrimitive.long)
            val config = NativeConfig(vector.getValue("endpoint").jsonPrimitive.content,
                bundledPolicy = vector.getValue("resource").toString(), consentCategories = ConsentCategory.entries)
            val core = C15tKernel(config, C15tStore(Memory()), clock = Clock { clock.get() }, executor = TaskExecutor.DIRECT)
            core.bootstrap()
            assertTrue(core.save(CommitIntent.All).ok)
            val p = ConsentPresenter(core, automaticPresentation = false)
            p.presentPreferences()
            val session = p.presentationID
            clock.addAndGet(604_800_000)
            assertTrue(core.snapshot().policyPending)
            p.loadDraft()
            assertEquals(session, p.presentationID)
            assertNotNull(core.bundledPolicyInfo)
            p.commit(ConsentPresenter.Action.REJECT)
            await { !p.pending }
            assertNull(p.errorCode)
            assertNull(p.presentationID)
            assertTrue(core.snapshot().policyPending)
            ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
            assertFalse(core.snapshot().explicitChoice!!.valueOf(ConsentCategory.MEASUREMENT)!!)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun failureStaysVisibleWhileARetryIsPending() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val store = Memory()
            val (core, _) = boot(store)
            val p = ConsentPresenter(core, automaticPresentation = false)
            p.presentPreferences()
            p.edit { it.copy(purposeConsents = listOf(7), vendorConsents = listOf(1)) }
            store.refuseNext = true
            p.commit(ConsentPresenter.Action.SAVE)
            await { !p.pending }
            assertEquals("Couldn't save your choices. Nothing changed on this device.", p.errorMessage)
            val hold = java.util.concurrent.CountDownLatch(1)
            store.holdNext = hold; store.refuseNext = true
            p.retry()
            // The row stays put while the retry runs; only an outcome replaces it, so nothing reflows under the thumb.
            assertTrue(p.pending); assertNotNull(p.errorCode)
            hold.countDown(); await { !p.pending }
            assertNotNull(p.errorCode)
            p.retry(); await { !p.pending }
            assertNull(p.errorCode); assertNull(p.presentationID)
            assertTrue(core.isIabAllowed(1, 7, IabLegalBasis.CONSENT))
        } finally { Dispatchers.resetMain() }
    }
    @Test fun providerPrerequisitesFollowTheDraftAndNamePurposes() {
        val (core, _) = boot()
        val p = ConsentPresenter(core, automaticPresentation = false)
        p.presentPreferences()
        assertFalse(p.providerPrerequisitesMet)
        assertEquals(listOf("Store and access information on a device", "Create profiles for personalised advertising",
            "Use profiles to select personalised advertising"), p.providerPrerequisiteNames)
        p.edit { it.copy(purposeConsents = listOf(1, 3, 4)) }
        assertTrue(p.providerPrerequisitesMet)
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("Presenter did not receive refreshed disclosure", condition())
    }
}
