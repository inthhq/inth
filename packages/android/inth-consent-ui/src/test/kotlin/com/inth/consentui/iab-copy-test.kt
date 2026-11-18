package com.inth.consentui

import com.inth.consentui.generated.IabCopy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The generated copy reads every language but English from its packaged JSON resource. */
class IabCopyTest {
    @Test fun everySupportedLanguageLoadsItsOwnCopy() {
        val english = IabCopy.forLanguage("en")
        assertTrue(IabCopy.supportedLanguages.size > 1)
        for (code in IabCopy.supportedLanguages) {
            val copy = IabCopy.forLanguage(code)
            assertEquals("$code fell back to English, so the resource did not load", code, copy.language)
            assertTrue("$code has no app description", copy.appDescription.contains("{partnerCount"))
            if (code != "en") assertNotEquals("$code repeats the English withdraw sentence", english.appWithdraw, copy.appWithdraw)
        }
    }

    @Test fun pluralTemplatesPickTheLanguagesForm() {
        val cs = IabCopy.forLanguage("cs")
        fun partners(copy: IabCopy, n: Int) = copy.format(copy.preferenceCenterPurposeItemPartners, mapOf("count" to "$n"))
        assertEquals("1 partner", partners(cs, 1))
        assertEquals("3 partneři", partners(cs, 3))
        assertEquals("5 partnerů", partners(cs, 5))
        val bg = IabCopy.forLanguage("bg")
        assertEquals("1 партньор", partners(bg, 1))
        assertEquals("2 партньора", partners(bg, 2))
        assertTrue(cs.format(cs.appDescription, mapOf("partnerCount" to "3")).startsWith("My a naši 3 partneři "))
        assertTrue(bg.format(bg.appDescription, mapOf("partnerCount" to "5")).startsWith("Ние и нашите 5 партньора "))
        // No language leaves an ICU token unrendered.
        for (code in IabCopy.supportedLanguages) {
            val copy = IabCopy.forLanguage(code)
            for (n in listOf(0, 1, 2, 5, 11, 22)) assertTrue("$code $n", !partners(copy, n).contains("plural"))
        }
    }

    @Test fun regionalAndUnknownCodesFallBack() {
        assertEquals("de", IabCopy.forLanguage("de_AT").language)
        assertEquals("pt", IabCopy.forLanguage("PT-br").language)
        assertEquals("en", IabCopy.forLanguage("xx").language)
    }
}
