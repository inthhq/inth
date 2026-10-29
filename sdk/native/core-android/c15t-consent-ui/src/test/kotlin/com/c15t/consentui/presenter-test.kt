package com.c15t.consentui

import com.c15t.core.*
import com.c15t.core.iab.*
import com.c15t.core.spi.*
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

@OptIn(ExperimentalCoroutinesApi::class)
class PresenterTest {
    private class Memory : KeyValueStore {
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
    }
    private fun boot(): Pair<C15tKernel, AtomicLong> {
        val now = AtomicLong(System.currentTimeMillis())
        val body = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "native/examples/consent-demo/fixtures/iab-init.json") }.first { it.exists() }.readText()
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), body) else HttpResponse(503)
        }
        val config = NativeConfig("https://fixture.invalid", iab = IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB"), iabListMaxAgeMs = 60_000)
        val core = C15tKernel(config, C15tStore(Memory()), clock = Clock { now.get() },
            transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
        core.bootstrap()
        return core to now
    }
    @Test fun retryPreservesDirtyExpiredListDraftUntilExplicitReload() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val (core, clock) = boot()
            val p = ConsentPresenter(core)
            p.customize()
            p.edit { it.copy(purposeConsents = listOf(7)) }
            val choices = p.choices
            clock.addAndGet(60_001)
            assertTrue(p.listUnavailable)
            p.refresh()
            assertTrue(p.dirty)
            assertEquals(choices, p.choices)
            await { !p.listUnavailable }
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
    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("Presenter did not receive refreshed disclosure", condition())
    }
}
