package com.c15t.demo

import com.c15t.core.iab.IabChoices
import com.c15t.core.iab.IabCommittedConsent
import com.c15t.core.iab.IabListAvailability
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.store.TcStorageBusKeys
import org.junit.Assert.*
import org.junit.Test

class TcfReviewTest {
    private fun report(profile: TcfReviewProfile, snapshot: ConsentSnapshot, consent: IabCommittedConsent?, values: Map<String, *>): String =
        captureTcfReview(profile, TcfReviewBuild("test.app", "1.0", "1", "test", "test-sdk"), snapshot, consent,
            IabListAvailability.MISSING, IabListAvailability.MISSING, null, values, 1).text

    private fun profile(id: String = "53", version: String = "7", country: String = "GB", vendors: String = "") =
        TcfReviewProfile.parse("https://review.example.test", "https://review.example.test/privacy", id, version, country, vendors)

    private fun refuses(block: () -> Unit) {
        assertThrows(IllegalArgumentException::class.java, block)
    }

    @Test fun assignedIdentityIsRequiredWithoutFallback() {
        listOf("", "1", "4096", "not-a-number").forEach { id -> refuses { profile(id = id) } }
        listOf("", "-1", "4096", "not-a-number").forEach { version -> refuses { profile(version = version) } }
        listOf("", "gb", "GBR").forEach { country -> refuses { profile(country = country) } }
        assertEquals(2, profile(id = "2", version = "0").nativeConfig().iab!!.cmpId)
        assertEquals(4095, profile(id = "4095", version = "4095").nativeConfig().iab!!.cmpVersion)
    }

    @Test fun vendorScopeIsExplicitAndPreserved() {
        assertNull(profile().nativeConfig().vendors)
        assertEquals(listOf(2, 9), profile(vendors = "2, 9").nativeConfig().vendors)
        listOf("0", "65536", "2,2", "2,", "vendor").forEach { vendors -> refuses { profile(vendors = vendors) } }
    }

    @Test fun reviewerSetupRefusesCredentialsAndUrlTokens() {
        listOf("http://review.example.test", "https://user:secret@review.example.test", "https://review.example.test?token=secret", "https://review.example.test#secret").forEach { url ->
            refuses { TcfReviewProfile.parse(url, "https://review.example.test/privacy", "53", "7", "GB", "") }
            refuses { TcfReviewProfile.parse("https://review.example.test", url, "53", "7", "GB", "") }
        }
    }

    @Test fun savedSetupRestoresTheExactNativeIabConfig() {
        val original = profile(vendors = "2,9")
        val restored = TcfReviewProfile.restore(original.storedValues())!!
        assertEquals(original, restored)
        assertEquals(original.nativeConfig(), restored.nativeConfig())
        assertNull(TcfReviewProfile.restore(emptyMap<String, String>()))
        refuses { TcfReviewProfile.restore(original.storedValues() + ("schema" to "2")) }
        refuses { TcfReviewProfile.restore(original.storedValues() + ("cmpId" to "")) }
    }

    @Test fun reportReadsPlatformValuesIndependentlyAndExcludesPrivateAuthorityFields() {
        val profile = profile()
        val authority = IabCommittedConsent(
            configuration = profile.nativeConfig().iab!!,
            choices = IabChoices(), subjectId = "private-subject", externalId = "private-external",
            fingerprint = "private-fingerprint", vendorListVersion = 123, policyVersion = 5,
            consentVersion = 2, createdAt = 1, actionAt = 1, tcString = "core-tc-string",
        )
        val text = report(profile, ConsentSnapshot(), authority, mapOf(
            TcStorageBusKeys.TC_STRING to "platform-tc-string",
            TcStorageBusKeys.CMP_SDK_ID to 53,
            "private-unrelated-pref" to "not-for-export",
        ))
        assertTrue(text.contains("Committed TCString: core-tc-string"))
        assertTrue(text.contains("IABTCF_TCString = String: platform-tc-string"))
        assertTrue(text.contains("IABTCF_CmpSdkID = Int: 53"))
        assertTrue(text.contains("IABTCF_CmpSdkVersion = absent"))
        listOf("private-subject", "private-external", "private-fingerprint", "private-unrelated-pref", "not-for-export").forEach {
            assertFalse(text.contains(it))
        }
    }

    @Test fun absentAuthorityAndMissingPlatformStringStayAbsent() {
        val text = report(profile(), ConsentSnapshot(), null, emptyMap<String, Any>())
        assertTrue(text.contains("Committed TCString: absent"))
        assertTrue(text.contains("IABTCF_TCString = absent"))
        assertTrue(text.contains("Committed GVL version: absent"))
    }
}
