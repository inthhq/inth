package com.c15t.consentui.headless

import com.c15t.core.ConsentCore
import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.iab.IabLegalBasis
import com.c15t.core.model.ConsentCategory
import com.c15t.core.spi.HttpClient
import com.c15t.core.spi.HttpRequest
import com.c15t.core.spi.HttpResponse
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.HostedTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.File

/** The headless draft's rules, with no composition: what an app-owned screen relies on. */
@OptIn(ExperimentalCoroutinesApi::class)
class HeadlessDraftTest {
    @Before fun main() = Dispatchers.setMain(Dispatchers.Unconfined)
    @After fun reset() = Dispatchers.resetMain()

    @Test fun categoryRowsCarryCopyLockAndBinding() {
        val draft = draft(core("category-init.json"))
        val necessary = draft.category(ConsentCategory.NECESSARY)
        assertTrue(necessary.locked)
        assertEquals("Always on", necessary.lockedLabel)
        assertFalse(necessary.enabled)
        // A locked row's callback stages nothing, so `necessary` never reaches a save.
        necessary.onCheckedChange(false)
        assertFalse(draft.isDirty)
        val measurement = draft.categories.first { it.category == ConsentCategory.MEASUREMENT }
        assertEquals(draft.copy.measurementTitle, measurement.title)
        assertFalse(measurement.locked)
        assertFalse(measurement.checked)
        measurement.onCheckedChange(true)
        assertTrue(draft.category(ConsentCategory.MEASUREMENT).checked)
        assertTrue(draft.isDirty)
        // An edit changes the draft only.
        assertFalse(draft.core.isAllowed(ConsentCategory.MEASUREMENT))
    }

    @Test fun aSaveNamesTheRevisionTheDraftWasReadAt() {
        val core = core("category-init.json")
        val first = draft(core)
        val second = draft(core)
        // An unsaved edit keeps the second draft from following the record.
        second.setCategory(ConsentCategory.MARKETING, true)
        first.setCategory(ConsentCategory.MEASUREMENT, true)
        var saved: Boolean? = null
        first.save { saved = it }
        assertEquals(true, saved)
        assertFalse(first.isDirty)
        var overtaken: Boolean? = null
        second.save { overtaken = it }
        assertEquals(false, overtaken)
        assertEquals("concurrent-change", second.errorCode)
        assertTrue(second.isStale)
        // The edit is still there to review, and nothing more is written until a reset.
        assertTrue(second.category(ConsentCategory.MARKETING).checked)
        assertFalse(second.category(ConsentCategory.MARKETING).enabled)
        assertFalse(core.isAllowed(ConsentCategory.MARKETING))
        second.reset()
        assertFalse(second.isStale)
        assertNull(second.errorCode)
        assertTrue(second.category(ConsentCategory.MEASUREMENT).checked)
    }

    @Test fun aRefusedWriteKeepsTheEditsAndRetrySendsThemAgain() {
        val store = Memory()
        val draft = draft(core("category-init.json", store))
        draft.setCategory(ConsentCategory.MEASUREMENT, true)
        store.refuseNext = true
        var result: Boolean? = null
        draft.save { result = it }
        assertEquals(false, result)
        assertEquals(draft.copy.saveFailed, draft.errorMessage)
        assertEquals(draft.copy.saveFailed, draft.announcement)
        assertFalse(draft.isStale)
        assertTrue(draft.category(ConsentCategory.MEASUREMENT).checked)
        assertFalse(draft.core.isAllowed(ConsentCategory.MEASUREMENT))
        draft.retry { result = it }
        assertEquals(true, result)
        assertNull(draft.errorMessage)
        assertTrue(draft.core.isAllowed(ConsentCategory.MEASUREMENT))
    }

    @Test fun aCleanDraftFollowsTheRecordAndASaveWithNothingToSayWritesNothing() {
        val core = core("category-init.json")
        val draft = draft(core)
        assertTrue(draft(core).also { it.save(ConsentWriteAction.ACCEPT_ALL) }.core.isAllowed(ConsentCategory.MARKETING))
        assertTrue(draft.category(ConsentCategory.MARKETING).checked)
        val revision = core.snapshot().revision
        var result: Boolean? = null
        draft.save { result = it }
        assertEquals(true, result)
        assertEquals(revision, core.snapshot().revision)
    }

    // TCF-CHECK: P21
    @Test fun aFirstIabDecisionOpensWithEveryConsentOff() {
        val iab = draft(core("iab-init.json", iab = true)).iab!!
        assertTrue(iab.purposes.isNotEmpty())
        assertTrue(iab.purposes.none { it.consent })
        assertTrue(iab.specialFeatures.none { it.optIn })
        assertTrue(iab.vendors.none { it.consent == true })
        assertTrue(iab.adTechProviders.none { it.consent })
        assertNull(iab.tcString)
    }

    // TCF-CHECK: T1, T2, P32
    @Test fun rejectAllTurnsEveryConsentOffAndOnlyASaveWritesTheString() {
        val draft = draft(core("iab-init.json", iab = true))
        draft.acceptAll()
        assertTrue(draft.iab!!.purposes.all { it.consent })
        // Staging alone publishes nothing.
        assertNull(draft.core.iabConsent)
        draft.save()
        assertNotNull(draft.iab!!.tcString)
        draft.rejectAll()
        val staged = draft.choices
        assertTrue(staged.purposeConsents.isEmpty() && staged.vendorConsents.isEmpty() && staged.specialFeatureOptIns.isEmpty())
        assertTrue(staged.adTechProviderConsents.isNullOrEmpty() && staged.customVendorConsents.isEmpty())
        draft.save()
        val committed = draft.core.iabConsent!!.choices
        assertTrue(committed.purposeConsents.isEmpty() && committed.vendorConsents.isEmpty())
        assertFalse(draft.core.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
    }

    // TCF-CHECK: T2
    @Test fun theOneTapRejectAllTurnsEveryConsentOff() {
        val draft = draft(core("iab-init.json", iab = true))
        draft.save(ConsentWriteAction.ACCEPT_ALL)
        assertTrue(draft.core.iabConsent!!.choices.purposeConsents.isNotEmpty())
        draft.save(ConsentWriteAction.REJECT_ALL)
        val committed = draft.core.iabConsent!!.choices
        assertTrue(committed.purposeConsents.isEmpty() && committed.vendorConsents.isEmpty() && committed.specialFeatureOptIns.isEmpty())
    }

    @Test fun aSaveResultIsSpokenOnceBeforeTheScreenHearsIt() {
        val draft = draft(core("category-init.json"))
        val prompt = mutableListOf<String>()
        val preferences = mutableListOf<String>()
        // Two blocks share the draft, as the prompt and preferences do.
        draft.announcers += { prompt += it }
        draft.announcers += { preferences += it }
        var closedBeforeSpoken = false
        draft.save(ConsentWriteAction.ACCEPT_ALL) { closedBeforeSpoken = preferences.isEmpty() }
        // Spoken before the screen hears the result, so closing on success does not lose it.
        assertFalse(closedBeforeSpoken)
        assertEquals(listOf(draft.copy.choicesSaved), preferences)
        assertTrue(prompt.isEmpty())
    }

    @Test fun aStaleVendorListIsNamedAndThePromptWithholdsAcceptAll() {
        val now = java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis())
        val core = fixtureCore("iab-init.json", Memory(), iab = true, clock = now, listMaxAgeMs = 60_000)
        val draft = draft(core)
        now.addAndGet(60_001)
        assertTrue(draft.listUnavailable)
        val prompt = ConsentPromptScope(draft, isNotice = false) {}
        assertTrue(prompt.listUnavailable)
        prompt.acceptAll()
        assertNull(draft.errorCode)
        assertNull(core.snapshot().explicitChoice)
        // A stale list refuses a staged save with its own message, not the storage one.
        draft.edit { it.copy(purposeConsents = listOf(1)) }
        var saved: Boolean? = null
        draft.save { saved = it }
        assertEquals(false, saved)
        assertEquals(draft.iabCopy.appListOutdated, draft.errorMessage)
    }

    @Test fun aStalePromptSaysSoAndWorksAgainAfterAReload() {
        val store = Memory()
        val core = core("category-init.json", store)
        val draft = draft(core)
        val prompt = ConsentPromptScope(draft, isNotice = false) {}
        // A refused write keeps the draft from following the record, then the record moves.
        store.refuseNext = true
        prompt.acceptAll()
        assertNotNull(draft.errorCode)
        core.refresh()
        draft.retry()
        assertTrue(prompt.isStale)
        prompt.acceptAll()
        assertNull(core.snapshot().explicitChoice)
        prompt.reload()
        assertFalse(prompt.isStale)
        prompt.acceptAll()
        assertTrue(core.isAllowed(ConsentCategory.MARKETING))
    }

    // TCF-CHECK: P18, P23
    @Test fun turningLegitimateInterestOffRecordsAnObjection() {
        val draft = draft(core("iab-init.json", iab = true))
        val iab = draft.iab!!
        val purpose = iab.purposes.first { it.legitimateInterest != null }
        assertEquals(true, purpose.legitimateInterest)
        assertTrue(purpose.rightToObject.isNotEmpty())
        purpose.onLegitimateInterestChange(false)
        assertTrue(purpose.id in draft.choices.purposeObjections)
        assertEquals(false, draft.iab!!.purposes.first { it.id == purpose.id }.legitimateInterest)
        val vendor = iab.vendors.first { it.legitimateInterest != null }
        vendor.onLegitimateInterestChange(false)
        assertTrue(vendor.id in draft.choices.vendorObjections)
        // Purposes 1 and 3 to 6 never take legitimate interest.
        iab.setPurposeLegitimateInterest(1, true)
        assertFalse(1 in draft.choices.purposeLegitimateInterests)
    }

    // TCF-CHECK: P3, P6, P7, P8, P9, P12, P16, P19, P25, P30
    @Test fun theDisclosureRowsCarryWhatTheScreensMustShow() {
        val iab = draft(core("iab-init.json", iab = true)).iab!!
        val first = iab.firstLayer
        assertEquals(iab.disclosure.bannerSummary.vendorCount, first.partnerCount)
        assertTrue(first.description.contains(first.partnersLabel))
        assertEquals(first.partnersLabel, first.description.substring(first.partnersLink))
        assertTrue(first.summary.isNotEmpty() && first.scope.isNotEmpty() && first.withdraw.isNotEmpty())
        // Providers are their own list with their own heading, apart from IAB vendors.
        assertEquals(iab.disclosure.adTechProviders.orEmpty().map { it.id }, iab.adTechProviders.map { it.id })
        assertTrue(iab.adTechProviders.isNotEmpty() && iab.adTechProvidersHeading.isNotEmpty())
        assertTrue(iab.adTechProviders.none { provider -> iab.vendors.any { it.name == provider.name } })
        val purpose = iab.purposes.first()
        assertEquals(iab.disclosure.partnerCounts(purpose.id).consent, purpose.consentPartnerCount)
        assertTrue(purpose.partnersNote.contains("${purpose.consentPartnerCount}"))
        val vendor = iab.vendors.first()
        assertEquals(iab.disclosure.vendors.getValue(vendor.id), vendor.disclosure)
        assertEquals(vendor.disclosure.consentPurposes.size, vendor.details.consentPurposes.size)
        assertNotNull(vendor.details.privacyPolicyUrl)
        assertTrue(vendor.details.retention.isNotEmpty() && vendor.details.storage.isNotEmpty())
        assertNotNull(iab.consentStorage)
    }

    private fun draft(core: ConsentCore) = ConsentDraft(core, CoroutineScope(Dispatchers.Unconfined), Dispatchers.Unconfined)

    private class Memory : KeyValueStore {
        @Volatile var refuseNext = false
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean {
            if (key == "com.c15t.snapshot" && refuseNext) { refuseNext = false; return false }
            write(key, value); return true
        }
    }

    private fun core(fixture: String, store: KeyValueStore = Memory(), iab: Boolean = false): ConsentCore = fixtureCore(fixture, store, iab)
}

internal fun fixtureCore(fixture: String, store: KeyValueStore, iab: Boolean = false, clock: java.util.concurrent.atomic.AtomicLong? = null, listMaxAgeMs: Long? = null): ConsentCore {
    val body = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
        .map { File(it, "examples/native/consent-demo/fixtures/$fixture") }.first { it.exists() }.readText()
    val client = object : HttpClient {
        override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
            HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), body) else HttpResponse(503)
    }
    val identity = if (iab) IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB") else null
    val config = if (listMaxAgeMs != null) NativeConfig("https://fixture.invalid", iab = identity, iabListMaxAgeMs = listMaxAgeMs) else NativeConfig("https://fixture.invalid", iab = identity)
    val time = com.c15t.core.spi.Clock { clock?.get() ?: System.currentTimeMillis() }
    return ConsentCore(config, C15tStore(store), clock = time, transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT).also { it.bootstrap() }
}
