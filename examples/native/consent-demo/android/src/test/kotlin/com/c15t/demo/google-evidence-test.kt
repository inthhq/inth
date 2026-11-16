package com.c15t.demo

import com.c15t.core.iab.AdTechProvider
import com.c15t.core.iab.IabChoices
import com.c15t.core.iab.IabCommittedConsent
import com.c15t.core.iab.IabListAvailability
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.KernelIabState
import com.c15t.core.store.TcStorageBusKeys
import com.c15t.core.tc.GlobalVendorList
import com.c15t.core.tc.GvlVendorEntry
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class GoogleEvidenceTest {
    private val profile = TcfReviewProfile.parse("https://review.example.test", "https://review.example.test/privacy", "53", "7", "GB", "")
    private val build = TcfReviewBuild("test.app", "1.0", "1", "debug", "3.0.0-alpha.1")
    private val capturedAt = 1793577600000L

    private fun capture(
        vendor: GvlVendorEntry? = null,
        status: IabListAvailability = IabListAvailability.MISSING,
        acStatus: IabListAvailability = IabListAvailability.MISSING,
        providers: List<AdTechProvider>? = null,
        values: Map<String, *> = emptyMap<String, Any>(),
        consent: IabCommittedConsent? = null,
    ): TcfReviewCapture {
        val list = vendor?.let { GlobalVendorList(purposes = emptyMap(), vendors = mapOf(755 to it), vendorListVersion = 999, tcfPolicyVersion = 5) }
        val snapshot = ConsentSnapshot(policyPending = false, model = ConsentModel.IAB,
            iab = list?.let(::KernelIabState), policySnapshotToken = "private-policy-token")
        return captureTcfReview(profile, build, snapshot, consent, status, acStatus, providers, values, capturedAt)
    }

    private fun TcfReviewCapture.root() = Json.parseToJsonElement(json).jsonObject
    private fun JsonObject.section(name: String) = getValue(name).jsonObject
    private fun JsonObject.storage(key: String) = getValue("storage").jsonArray.map { it.jsonObject }.single { it.getValue("key").jsonPrimitive.content == key }

    @Test fun commonEnvelopeUsesExplicitNullsAndSeparateAppSdkIdentity() {
        val root = capture().root()
        assertEquals(setOf("schemaVersion", "platform", "capturedAtMs", "app", "sdkVersion", "configuration", "core", "disclosures", "storage"), root.keys)
        assertEquals(1, root.getValue("schemaVersion").jsonPrimitive.int)
        assertEquals("android", root.getValue("platform").jsonPrimitive.content)
        assertEquals(capturedAt, root.getValue("capturedAtMs").jsonPrimitive.long)
        assertEquals("1.0", root.section("app").getValue("version").jsonPrimitive.content)
        assertEquals("1", root.section("app").getValue("build").jsonPrimitive.content)
        assertEquals("3.0.0-alpha.1", root.getValue("sdkVersion").jsonPrimitive.content)
        assertEquals(JsonNull, root.section("configuration")["vendorIds"])
        listOf("tcString", "additionalConsent", "vendorListVersion", "policyVersion").forEach {
            assertEquals(JsonNull, root.section("core")[it])
        }
        listOf("googleVendor", "adTechProviders", "vendorListVersion", "policyVersion").forEach {
            assertEquals(JsonNull, root.section("disclosures")[it])
        }
    }

    @Test fun actualGoogleRowPreservesDeletionAndMissingVersusEmptyDeclarations() {
        val vendor = GvlVendorEntry(id = 999, name = "Loaded vendor name", purposes = null,
            legIntPurposes = emptyList(), flexiblePurposes = listOf(2, 7), deletedDate = "2026-01-01")
        val provider = AdTechProvider(35, "Retained provider", "https://provider.example.test/privacy")
        val report = capture(vendor, IabListAvailability.STALE, IabListAvailability.STALE, listOf(provider))
        val disclosures = report.root().section("disclosures")
        val google = disclosures.getValue("googleVendor").jsonObject
        assertEquals(755, google.getValue("id").jsonPrimitive.int)
        assertEquals("Loaded vendor name", google.getValue("name").jsonPrimitive.content)
        assertTrue(google.getValue("deleted").jsonPrimitive.boolean)
        assertEquals(JsonNull, google["purposes"])
        assertEquals(JsonArray(emptyList()), google["legIntPurposes"])
        assertEquals(listOf(2L, 7L), google.getValue("flexiblePurposes").jsonArray.map { it.jsonPrimitive.long })
        assertEquals("stale", disclosures.getValue("iabStatus").jsonPrimitive.content)
        assertEquals("stale", disclosures.getValue("additionalConsentStatus").jsonPrimitive.content)
        val retained = disclosures.getValue("adTechProviders").jsonArray.single().jsonObject
        assertEquals(35L, retained.getValue("id").jsonPrimitive.long)
        assertEquals(provider.policyUrl, retained.getValue("policyUrl").jsonPrimitive.content)
        assertTrue(report.text.contains("Retained provider"))
        assertTrue(report.text.contains("stale"))
        assertTrue(report.text.contains("Loaded vendor name"))
        assertEquals(JsonNull, report.root().section("core")["tcString"])
    }

    @Test fun absentAndExplicitlyEmptyProviderListsStayDistinct() {
        val absent = capture(acStatus = IabListAvailability.UNAVAILABLE).root().section("disclosures")
        val empty = capture(acStatus = IabListAvailability.FRESH, providers = emptyList()).root().section("disclosures")
        assertEquals(JsonNull, absent["adTechProviders"])
        assertEquals("unavailable", absent.getValue("additionalConsentStatus").jsonPrimitive.content)
        assertEquals(JsonArray(emptyList()), empty["adTechProviders"])
        assertEquals("fresh", empty.getValue("additionalConsentStatus").jsonPrimitive.content)
    }

    @Test fun actualPlatformTypesArePreservedWithoutCoercionOrUnknownValueExport() {
        val root = capture(values = mapOf(
            TcStorageBusKeys.CMP_SDK_ID to 53L,
            TcStorageBusKeys.CMP_SDK_VERSION to "7",
            TcStorageBusKeys.POLICY_VERSION to true,
            TcStorageBusKeys.GDPR_APPLIES to 1.0f,
            TcStorageBusKeys.PUBLISHER_CC to setOf("private-unsupported-value"),
            TcStorageBusKeys.PURPOSE_ONE_TREATMENT to 0,
            "private-unowned-key" to "private-unowned-value",
        )).root()
        mapOf(TcStorageBusKeys.CMP_SDK_ID to "Long", TcStorageBusKeys.CMP_SDK_VERSION to "String",
            TcStorageBusKeys.POLICY_VERSION to "Boolean", TcStorageBusKeys.GDPR_APPLIES to "Float",
            TcStorageBusKeys.PURPOSE_ONE_TREATMENT to "Int").forEach { (key, type) ->
            assertEquals(type, root.storage(key).getValue("type").jsonPrimitive.content)
            assertTrue(root.storage(key).getValue("value").jsonPrimitive.isString)
        }
        assertEquals("unsupported", root.storage(TcStorageBusKeys.PUBLISHER_CC).getValue("type").jsonPrimitive.content)
        assertEquals(JsonNull, root.storage(TcStorageBusKeys.PUBLISHER_CC)["value"])
        assertEquals("absent", root.storage(TcStorageBusKeys.TC_STRING).getValue("type").jsonPrimitive.content)
        assertEquals(JsonNull, root.storage(TcStorageBusKeys.TC_STRING)["value"])
        assertFalse(root.toString().contains("private-unsupported-value"))
        assertFalse(root.toString().contains("private-unowned-value"))
    }

    @Test fun textAndJsonKeepTheSameCapturedObservationAfterInputsChange() {
        val purposes = mutableListOf(1L, 3L)
        val providers = mutableListOf(AdTechProvider(35, "Captured provider", "https://provider.example.test/privacy"))
        val platform = mutableMapOf<String, Any>(TcStorageBusKeys.TC_STRING to "captured-platform-string")
        val report = capture(GvlVendorEntry(name = "Captured Google", purposes = purposes),
            IabListAvailability.FRESH, IabListAvailability.FRESH, providers, platform)
        purposes.add(99)
        providers.clear()
        platform[TcStorageBusKeys.TC_STRING] = "later-platform-string"
        val disclosures = report.root().section("disclosures")
        assertEquals(listOf(1L, 3L), disclosures.getValue("googleVendor").jsonObject.getValue("purposes").jsonArray.map { it.jsonPrimitive.long })
        assertEquals(1, disclosures.getValue("adTechProviders").jsonArray.size)
        assertEquals("captured-platform-string", report.root().storage(TcStorageBusKeys.TC_STRING).getValue("value").jsonPrimitive.content)
        assertTrue(report.text.contains("captured-platform-string"))
        assertFalse(report.text.contains("later-platform-string"))
        assertTrue(report.text.contains("not atomic"))
    }

    @Test fun committedAcAndTcExportExactlyWithoutPrivateAuthorityOrSnapshotFields() {
        val consent = IabCommittedConsent(profile.nativeConfig().iab!!, IabChoices(), "private-subject", "private-external",
            "private-fingerprint", 999, 5, 2, 1, 1, "exact-native-tc", addtlConsent = "2~35~dv.35")
        val report = capture(consent = consent)
        val core = report.root().section("core")
        assertEquals("exact-native-tc", core.getValue("tcString").jsonPrimitive.content)
        assertEquals("2~35~dv.35", core.getValue("additionalConsent").jsonPrimitive.content)
        assertTrue(report.text.contains("Additional Consent: 2~35~dv.35"))
        listOf("private-subject", "private-external", "private-fingerprint", "private-policy-token").forEach { secret ->
            assertFalse(report.json.contains(secret))
            assertFalse(report.text.contains(secret))
        }
    }
}
