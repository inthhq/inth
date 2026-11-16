package com.c15t.core

import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.store.*
import com.c15t.core.tc.*
import java.io.File
import kotlin.test.*

class NativePresentationTest {
    private class RefusingStore : KeyValueStore {
        val base = InMemoryKeyValueStore()
        var refuse = false
        override fun read(key: String) = base.read(key)
        override fun write(key: String, value: String?) = base.write(key,value)
        override fun writeDurably(key: String, value: String?) = if (refuse && key == C15tStoreKeys.SNAPSHOT) false else base.writeDurably(key,value)
    }
    private fun body(mode: String) = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
        .map { File(it,"native/examples/consent-demo/fixtures/$mode-init.json") }.first { it.exists() }.readText()

    @Test fun `refused notice keeps obligation and retry persists without granting`() {
        val backend = RefusingStore()
        val transport = RecordingTransport().respondInit(initSuccess(body = body("notice")))
        val core = testKernel(store = C15tStore(backend),transport = transport)
        core.bootstrap()
        val before = core.snapshot()
        assertTrue(before.promptRequirement.notice)
        val bytes = backend.read(C15tStoreKeys.SNAPSHOT)
        backend.refuse = true
        core.dismissNotice()
        assertEquals(before,core.snapshot())
        assertEquals(bytes,backend.read(C15tStoreKeys.SNAPSHOT))
        backend.refuse = false
        assertTrue(core.dismissNotice())
        assertFalse(core.snapshot().promptRequirement.notice)
        assertEquals(before.effectivePermissions,core.snapshot().effectivePermissions)
        assertNull(core.snapshot().explicitChoice)
        val cold = testKernel(store = C15tStore(backend))
        cold.bootstrap()
        assertFalse(cold.snapshot().promptRequirement.notice)
    }
    @Test fun `publisher restriction projection handles each basis and no prohibited LI`() {
        val vendor = GvlVendorEntry(id=12, purposes=listOf(1,3,4,7,8),legIntPurposes=listOf(7,8,9),flexiblePurposes=listOf(7,8,9))
        val c = IabConfiguration(cmpId=53,cmpVersion=7,publisherCountryCode="GB",publisherRestrictions=listOf(
            IabPublisherRestriction(7,0,listOf(12)), IabPublisherRestriction(8,2,listOf(12)), IabPublisherRestriction(9,1,listOf(12))))
        val d = c.disclosure(12,vendor)
        assertEquals(listOf(1,3,4,9),d.consentPurposes)
        assertEquals(listOf(8),d.legitimateInterestPurposes)
        assertEquals(listOf(7),d.notAllowedPurposes)
    }
    @Test fun `presentation is detached from authority and starts with no LI`() {
        val c = TEST_CONFIG.copy(iab=IabConfiguration(cmpId=53,cmpVersion=7,publisherCountryCode="GB"))
        val core = testKernel(config=c,store=C15tStore(InMemoryKeyValueStore()),transport=RecordingTransport().respondInit(initSuccess(body=body("iab"))))
        core.bootstrap()
        val d = assertNotNull(core.iabPresentation())
        assertEquals(core.snapshot().revision,d.draft.revision)
        assertTrue(d.draft.choices.purposeLegitimateInterests.isEmpty())
        assertTrue(d.draft.choices.vendorLegitimateInterests.isEmpty())
        (d.list.vendors[1]!!.purposes as MutableList<Long>).clear()
        assertEquals(listOf(1L,3L,4L,7L),core.iabPresentation()!!.list.vendors[1]!!.purposes)
        assertNull(core.iabConsent)
    }
}
