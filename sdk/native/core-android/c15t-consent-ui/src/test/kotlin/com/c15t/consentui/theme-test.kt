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

    @Test fun blendMovesEachAppearanceSeparately() {
        val blended = ConsentThemeColor(0x335CFF, 0x8CA2FF).blended(toward = ConsentThemeColor(0x1E1B17, 0xF3EEE6), fraction = 0.3f)
        assertEquals(ConsentThemeColor(0x2D49B9, 0xABB9F8), blended)
        val accent = ConsentThemeColor(0x335CFF)
        assertEquals(accent, accent.blended(toward = ConsentThemeColor(0x000000), fraction = 0f))
        assertEquals(ConsentThemeColor(0x000000), accent.blended(toward = ConsentThemeColor(0x000000), fraction = 7f))
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
    @Test fun providerBrandingIsIndependentOfTheAppIdentity() {
        val base = ConsentTheme(brand = ConsentTheme.Brand(name = "Pantry"))
        assertEquals(ConsentTheme.Branding.C15t, base.branding)
        for (value in listOf("inth", "consent", " Inth ")) {
            val result = base.applying(Bundle().apply { putString(ConsentTheme.Meta.META_BRANDING_PROVIDER, value) }, context)
            assertEquals(ConsentTheme.Branding.Inth, result.branding)
            assertEquals(base.brand, result.brand)
        }
        val inth = base.copy(branding = ConsentTheme.Branding.Inth)
        assertEquals(inth, inth.applying(Bundle().apply { putString(ConsentTheme.Meta.META_BRANDING_PROVIDER, "unknown") }, context))
        assertEquals(ConsentTheme.Branding.C15t, inth.applying(Bundle().apply { putString(ConsentTheme.Meta.META_BRANDING_PROVIDER, "c15t") }, context).branding)
    }

    @Test fun customAttributionNeverKeepsAnUnrelatedProviderLogo() {
        val base = ConsentTheme(branding = ConsentTheme.Branding.Inth)
        val nameOnly = Bundle().apply { putString(ConsentTheme.Meta.META_BRANDING_NAME, "Example") }
        assertEquals(ConsentTheme.Branding.Custom("Example"), base.applying(nameOnly, context).branding)
        val custom = Bundle(nameOnly).apply { putInt(ConsentTheme.Meta.META_BRANDING_MARK, android.R.drawable.ic_dialog_info) }
        assertEquals(ConsentTheme.Branding.Custom("Example", android.R.drawable.ic_dialog_info), base.applying(custom, context).branding)
        assertTrue(base.applying(custom, context).showsBranding)
        custom.putBoolean(ConsentTheme.Meta.META_BRANDING, false)
        assertFalse(base.applying(custom, context).showsBranding)
    }

    @Test fun orphanAndMalformedProviderMarksKeepBuiltInIdentity() {
        val markOnly = Bundle().apply { putInt(ConsentTheme.Meta.META_BRANDING_MARK, android.R.drawable.ic_dialog_info) }
        assertEquals(ConsentTheme.Branding.C15t, ConsentTheme.c15t.applying(markOnly, context).branding)
        val custom = ConsentTheme(branding = ConsentTheme.Branding.Custom("Example"))
        assertEquals(ConsentTheme.Branding.Custom("Example", android.R.drawable.ic_dialog_info), custom.applying(markOnly, context).branding)
        for (value in listOf(0, -1, 99999)) {
            val malformed = Bundle().apply { putInt(ConsentTheme.Meta.META_BRANDING_MARK, value) }
            assertEquals(custom, custom.applying(malformed, context))
        }
        assertEquals(custom, custom.applying(Bundle().apply { putInt(ConsentTheme.Meta.META_BRANDING_NAME, 7) }, context))
    }

}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IdentityTest {
    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test fun brandDefaultsCanBeCustomizedAndHidden() {
        assertFalse(ConsentTheme.c15t.brand.hidden)
        assertNull(ConsentTheme.c15t.brand.name)
        assertTrue(ConsentTheme.Brand.Hidden.hidden)
        val hidden = ConsentTheme.c15t.applying(Bundle().apply { putBoolean(ConsentTheme.Meta.META_BRAND, false) }, context)
        assertTrue(hidden.brand.hidden)
        assertFalse(hidden.applying(Bundle().apply { putString(ConsentTheme.Meta.META_BRAND, "yes") }, context).brand.hidden)
        assertTrue(hidden.applying(Bundle().apply { putString(ConsentTheme.Meta.META_BRAND, "maybe") }, context).brand.hidden)
        val named = ConsentTheme.c15t.applying(Bundle().apply { putString(ConsentTheme.Meta.META_BRAND_NAME, "Pantry") }, context)
        assertEquals(ConsentTheme.Brand(name = "Pantry"), named.brand)
    }

    @Test fun stockIdentityUsesThePlaceholderAndSelectedProvider() {
        for (provider in listOf(ConsentTheme.Branding.C15t, ConsentTheme.Branding.Inth)) {
            val resolved = HeaderIdentity.resolve(context, ConsentTheme.Brand(), provider)
            assertEquals("Your brand here", resolved.name)
            assertEquals(provider, resolved.provider)
            assertNull(resolved.markResId)
        }
        assertEquals(ConsentTheme.HeadlineFont.SansSerif, ConsentTheme.c15t.headlineFont)
        assertEquals(androidx.compose.ui.text.font.FontFamily.Default, ConsentTheme.c15t.headlineFont.family)
    }

    @Test fun explicitBrandMarksAndNamesOverrideTheStockIdentity() {
        val named = HeaderIdentity.resolve(context, ConsentTheme.Brand(name = "Pantry"), ConsentTheme.Branding.Inth)
        assertEquals("Pantry", named.name)
        assertEquals(ConsentTheme.Branding.Inth, named.provider)
        val marked = HeaderIdentity.resolve(context, ConsentTheme.Brand(markResId = android.R.drawable.ic_dialog_info), ConsentTheme.Branding.Inth)
        assertEquals(android.R.drawable.ic_dialog_info, marked.markResId)
        assertNull(marked.provider)
        val missing = HeaderIdentity.resolve(context, ConsentTheme.Brand(markResId = 1), ConsentTheme.Branding.Inth)
        assertNull(missing.markResId); assertNull(missing.provider)
        assertEquals("Y", HeaderIdentity.initial(missing.name))
        assertEquals("P", HeaderIdentity.initial("pantry"))
        assertEquals("", HeaderIdentity.initial("  "))
    }

    @Test fun customProvidersUseTheirMarkOrInitial() {
        val custom = HeaderIdentity.resolve(context, ConsentTheme.Brand(), ConsentTheme.Branding.Custom("Example", android.R.drawable.ic_dialog_info))
        assertEquals(android.R.drawable.ic_dialog_info, custom.markResId)
        assertEquals("Your brand here", custom.name)
        val noMark = HeaderIdentity.resolve(context, ConsentTheme.Brand(), ConsentTheme.Branding.Custom("Example"))
        assertNull(noMark.markResId); assertNull(noMark.provider)
        assertEquals("Y", HeaderIdentity.initial(noMark.name))
    }
}
