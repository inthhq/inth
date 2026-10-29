package com.c15t.consentui

import android.os.Bundle
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ThemeTest {
    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test fun hexParsingAcceptsOneOrTwoColours() {
        assertEquals(ConsentThemeColor(0x00CCBC), ConsentThemeColor.parse("#00CCBC"))
        assertEquals(ConsentThemeColor(0x00CCBC), ConsentThemeColor.parse("00ccbc"))
        assertEquals(ConsentThemeColor(0x00CCBC, 0x7FE6DC), ConsentThemeColor.parse(" #00CCBC , #7FE6DC "))
        assertNull(ConsentThemeColor.parse("#00CCB"))
        assertNull(ConsentThemeColor.parse("#00CCBC,#7FE6DC,#000000"))
        assertNull(ConsentThemeColor.parse("teal"))
        assertNull(ConsentThemeColor.parse("#00CCBC,"))
    }

    @Test fun manifestValuesOverrideOnlyWhatTheyName() {
        val bundle = Bundle().apply {
            putString(ConsentTheme.Meta.META_ACCENT, "#00CCBC,#7FE6DC")
            putString(ConsentTheme.Meta.META_BRAND_NAME, "Pantry")
            putString(ConsentTheme.Meta.META_HEADLINE, "Before you shop.")
            putString(ConsentTheme.Meta.META_HEADLINE_FONT, "sans")
            putInt(ConsentTheme.Meta.META_CORNER_RADIUS, 8)
            putBoolean(ConsentTheme.Meta.META_BRANDING, false)
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(ConsentThemeColor(0x00CCBC, 0x7FE6DC), theme.colors.accent)
        assertEquals(ConsentTheme.Colors.c15t.decision, theme.colors.decision)
        assertEquals("Pantry", theme.brand.name)
        assertNull(theme.brand.markResId)
        assertEquals("Before you shop.", theme.copy.headline)
        assertEquals(ConsentTheme.Copy.c15t.introduction, theme.copy.introduction)
        assertEquals(ConsentTheme.HeadlineFont.SansSerif, theme.headlineFont)
        assertEquals(8.dp, theme.cornerRadius)
        assertFalse(theme.showsBranding)
    }

    @Test fun unreadableValuesKeepTheExistingTheme() {
        val base = ConsentTheme(cornerRadius = 20.dp, headlineFont = ConsentTheme.HeadlineFont.SansSerif)
        val bundle = Bundle().apply {
            putString(ConsentTheme.Meta.META_ACCENT, "not a colour")
            putString(ConsentTheme.Meta.META_CORNER_RADIUS, "-4")
            putString(ConsentTheme.Meta.META_HEADLINE, "   ")
            putString(ConsentTheme.Meta.META_BRANDING, "maybe")
            putString(ConsentTheme.Meta.META_BRAND_MARK, "no_such_drawable")
        }
        assertEquals(base, base.applying(bundle, context))
        assertEquals(base, base.applying(null, context))
    }

    @Test fun stringSpellingsOfRadiusAndBrandingResolve() {
        val bundle = Bundle().apply {
            putString(ConsentTheme.Meta.META_CORNER_RADIUS, "6")
            putString(ConsentTheme.Meta.META_BRANDING, "NO")
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(6.dp, theme.cornerRadius)
        assertFalse(theme.showsBranding)
    }

    @Test fun resolveLayersManifestOverCurrent() {
        val previous = ConsentTheme.current
        try {
            ConsentTheme.current = ConsentTheme(cornerRadius = 4.dp)
            assertEquals(4.dp, ConsentTheme.resolve(context).cornerRadius)
            ConsentTheme.current = null
            assertTrue(ConsentTheme.resolve(context) == ConsentTheme.c15t)
        } finally { ConsentTheme.current = previous }
    }

    @Test fun typedManifestColoursKeepLiteralsAndResolveResources() {
        val bundle = Bundle().apply {
            putInt(ConsentTheme.Meta.META_ACCENT, 0xFF009688.toInt())
            putInt(ConsentTheme.Meta.META_ON_ACCENT, android.R.color.white)
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(ConsentThemeColor(0x009688), theme.colors.accent)
        assertEquals(ConsentThemeColor(0xFFFFFF), theme.colors.onAccent)
    }

    @Test fun squareAndSmallThemesProduceValidCalloutOutlines() {
        for (radius in listOf(0.dp, 1.dp, 2.dp, 14.dp)) {
            RoundedCornerShape(ConsentTheme(cornerRadius = radius).calloutRadius)
                .createOutline(Size(300f, 120f), LayoutDirection.Ltr, Density(1f))
        }
    }

    @Test fun nonFiniteRadiusKeepsTheHostValue() {
        val base = ConsentTheme(cornerRadius = 10.dp)
        for (value in listOf("Infinity", "NaN")) {
            assertEquals(base, base.applying(Bundle().apply { putString(ConsentTheme.Meta.META_CORNER_RADIUS, value) }, context))
        }
    }
}
