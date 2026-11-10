package com.c15t.consentui

import android.os.Bundle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLog

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
            putString(ConsentTheme.Meta.META_PRIMARY, "#00CCBC,#7FE6DC")
            putString(ConsentTheme.Meta.META_BRAND_NAME, "Pantry")
            putString(ConsentTheme.Meta.META_HEADLINE, "Before you shop.")
            putString(ConsentTheme.Meta.META_HEADLINE_FONT, "sans")
            putInt(ConsentTheme.Meta.META_RADIUS_MD, 8)
            putBoolean(ConsentTheme.Meta.META_BRANDING, false)
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(ConsentThemeColor(0x00CCBC, 0x7FE6DC), theme.colors.primary)
        assertEquals(ConsentTheme.Colors.c15t.decision, theme.colors.decision)
        assertEquals("Pantry", theme.brand.name)
        assertNull(theme.brand.markResId)
        assertEquals("Before you shop.", theme.copy.headline)
        assertEquals(ConsentTheme.Copy.c15t.introduction, theme.copy.introduction)
        assertEquals(ConsentTheme.HeadlineFont.SansSerif, theme.typography.headlineFont)
        assertEquals(8.dp, theme.radius.md)
        assertFalse(theme.showsBranding)
    }

    @Test fun unreadableValuesKeepTheExistingTheme() {
        val base = ConsentTheme(radius = ConsentTheme.Radius(md = 20.dp), typography = ConsentTheme.Typography(headlineFont = ConsentTheme.HeadlineFont.SansSerif))
        val bundle = Bundle().apply {
            putString(ConsentTheme.Meta.META_PRIMARY, "not a colour")
            putString(ConsentTheme.Meta.META_RADIUS_MD, "-4")
            putString(ConsentTheme.Meta.META_HEADLINE, "   ")
            putString(ConsentTheme.Meta.META_BRANDING, "maybe")
            putString(ConsentTheme.Meta.META_BRAND_MARK, "no_such_drawable")
        }
        assertEquals(base, base.applying(bundle, context))
        assertEquals(base, base.applying(null, context))
    }

    @Test fun stringSpellingsOfRadiusAndBrandingResolve() {
        val bundle = Bundle().apply {
            putString(ConsentTheme.Meta.META_RADIUS_MD, "6")
            putString(ConsentTheme.Meta.META_BRANDING, "NO")
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(6.dp, theme.radius.md)
        assertFalse(theme.showsBranding)
    }

    @Test fun resolveLayersManifestOverCurrent() {
        val previous = ConsentTheme.current
        try {
            ConsentTheme.current = ConsentTheme(radius = ConsentTheme.Radius(md = 4.dp))
            assertEquals(4.dp, ConsentTheme.resolve(context).radius.md)
            ConsentTheme.current = null
            assertTrue(ConsentTheme.resolve(context) == ConsentTheme.c15t)
        } finally { ConsentTheme.current = previous }
    }

    @Test fun typedManifestColoursKeepLiteralsAndResolveResources() {
        val bundle = Bundle().apply {
            putInt(ConsentTheme.Meta.META_PRIMARY, 0xFF009688.toInt())
            putInt(ConsentTheme.Meta.META_TEXT_ON_PRIMARY, android.R.color.white)
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(ConsentThemeColor(0x009688), theme.colors.primary)
        assertEquals(ConsentThemeColor(0xFFFFFF), theme.colors.textOnPrimary)
    }

    // TCF-CHECK: P11
    @Test fun lowContrastDecisionColoursFallBackToStockPerAppearanceAndLogOnce() {
        ConsentTheme.decisionContrastWarned.set(false)
        ShadowLog.reset()
        val stock = ConsentTheme.Colors.c15t
        // A manifest DECISION near the stock light text: fine in dark, unreadable in light.
        val bundle = Bundle().apply {
            putString(ConsentTheme.Meta.META_DECISION, "#C8C2B8,#1E1B17")
            putString(ConsentTheme.Meta.META_TEXT_ON_DECISION, "#F8F4EE,#F8F4EE")
        }
        val host = ConsentTheme.c15t.applying(bundle, context)
        val guarded = host.withReadableDecisions()
        assertEquals(ConsentThemeColor(stock.decision.light, 0x1E1B17), guarded.colors.decision)
        assertEquals(ConsentThemeColor(stock.textOnDecision.light, 0xF8F4EE), guarded.colors.textOnDecision)
        for (dark in listOf(false, true)) {
            val pick = { color: ConsentThemeColor -> if (dark) color.dark else color.light }
            val ratio = ConsentTheme.contrastRatio(pick(guarded.colors.decision), pick(guarded.colors.textOnDecision))
            assertTrue("decision label (${if (dark) "dark" else "light"}) was $ratio", ratio >= 5.0)
        }
        // Only the decision pair changes, and a passing theme is returned as it is.
        assertEquals(host.colors.copy(decision = guarded.colors.decision, textOnDecision = guarded.colors.textOnDecision), guarded.colors)
        assertSame(ConsentTheme.c15t, ConsentTheme.c15t.withReadableDecisions())
        // A host ConsentTheme gets the same floor, and the warning is logged once per process.
        val code = ConsentTheme(colors = stock.copy(decision = ConsentThemeColor(0x335CFF), textOnDecision = ConsentThemeColor(0x8CA2FF))).withReadableDecisions()
        assertEquals(stock.decision, code.colors.decision)
        assertEquals(stock.textOnDecision, code.colors.textOnDecision)
        assertEquals(1, ShadowLog.getLogsForTag(ConsentTheme.LOG_TAG).size)
    }

    // TCF-CHECK: P11
    @Test fun primaryButtonSlotColoursAreGuardedToo() {
        val host = ConsentTheme(slots = mapOf(ConsentTheme.Slot.ButtonPrimary to ConsentTheme.SlotStyle(
            color = ConsentThemeColor(0xFFFFFF), backgroundColor = ConsentThemeColor(0xBBBBBB), borderRadius = 4.dp)))
        val guarded = host.withReadableDecisions()
        assertEquals(ConsentTheme.Colors.c15t.decision, guarded.decisionFill)
        assertEquals(ConsentTheme.Colors.c15t.textOnDecision, guarded.decisionLabel)
        // The slot keeps what is not a colour.
        assertEquals(ConsentTheme.SlotStyle(borderRadius = 4.dp), guarded.slots[ConsentTheme.Slot.ButtonPrimary])
    }

    @Test fun manifestReadsSpacingTypeAndSlots() {
        val bundle = Bundle().apply {
            putInt(ConsentTheme.Meta.META_RADIUS_SM, 2)
            putString(ConsentTheme.Meta.META_RADIUS_LG, "28")
            putFloat(ConsentTheme.Meta.META_SPACE_MD, 20f)
            putString(ConsentTheme.Meta.META_SPACE_LG, "32")
            putInt(ConsentTheme.Meta.META_FONT_SIZE_SM, 15)
            putString(ConsentTheme.Meta.META_FONT_SIZE_BASE, "18")
            putInt(ConsentTheme.Meta.META_FONT_SIZE_LG, 0)
            putInt(ConsentTheme.Meta.slot(ConsentTheme.Slot.ButtonPrimary, "BORDER_RADIUS"), 999)
            putString(ConsentTheme.Meta.slot(ConsentTheme.Slot.ButtonSecondary, "COLOR"), "#112233")
            putString(ConsentTheme.Meta.slot(ConsentTheme.Slot.ConsentBannerTitle, "FONT_SIZE"), "40")
        }
        val theme = ConsentTheme.c15t.applying(bundle, context)
        assertEquals(ConsentTheme.Radius(sm = 2.dp, md = 14.dp, lg = 28.dp), theme.radius)
        assertEquals(ConsentTheme.Spacing(md = 20.dp, lg = 32.dp), theme.spacing)
        // A size of 0 is unreadable and keeps the Material size.
        assertEquals(ConsentTheme.FontSize(sm = 15.sp, base = 18.sp), theme.typography.fontSize)
        assertEquals(mapOf(
            ConsentTheme.Slot.ButtonPrimary to ConsentTheme.SlotStyle(borderRadius = 999.dp),
            ConsentTheme.Slot.ButtonSecondary to ConsentTheme.SlotStyle(color = ConsentThemeColor(0x112233)),
            ConsentTheme.Slot.ConsentBannerTitle to ConsentTheme.SlotStyle(fontSize = 40.sp),
        ), theme.slots)
        assertEquals("com.c15t.consent.BUTTON_PRIMARY_BACKGROUND_COLOR", ConsentTheme.Meta.slot(ConsentTheme.Slot.ButtonPrimary, "BACKGROUND_COLOR"))
    }

    @Test fun radiusStepsFollowMdUntilSet() {
        assertEquals(8.dp, ConsentTheme.Radius(md = 10.dp).resolvedSm)
        assertEquals(16.dp, ConsentTheme.Radius(md = 10.dp).resolvedLg)
        assertEquals(3.dp, ConsentTheme.Radius(sm = 1.dp, md = 10.dp, lg = 3.dp).resolvedLg)
    }

    @Test fun typeTokensScaleTheirMaterialGroups() {
        val stock = androidx.compose.material3.Typography()
        assertEquals(stock, ConsentTheme.c15t.materialTypography())
        val themed = ConsentTheme(typography = ConsentTheme.Typography(fontSize = ConsentTheme.FontSize(sm = 15.sp, base = 18.sp, lg = 40.sp)))
            .materialTypography()
        assertEquals(15.sp, themed.bodyMedium.fontSize)
        // A role keeps its ratio to the group lead: bodySmall is 12 of bodyMedium's 14.
        assertEquals(15f * 12f / 14f, themed.bodySmall.fontSize.value, 0.001f)
        assertEquals(18.sp, themed.bodyLarge.fontSize)
        assertEquals(stock.bodyLarge.lineHeight.value * 18f / 16f, themed.bodyLarge.lineHeight.value, 0.001f)
        assertEquals(22f * 40f / 34f, themed.titleLarge.fontSize.value, 0.001f)
        val headline = ConsentTheme(typography = ConsentTheme.Typography(fontSize = ConsentTheme.FontSize(lg = 40.sp))).headlineStyle(stock.headlineLarge)
        assertEquals(40.sp, headline.fontSize)
        assertEquals(34.sp, ConsentTheme.c15t.headlineStyle(stock.headlineLarge).fontSize)
        assertEquals(40.sp, ConsentTheme.c15t.headlineStyle(stock.headlineLarge).lineHeight)
    }

    @Test fun contrastRatioMatchesWcag() {
        assertEquals(21.0, ConsentTheme.contrastRatio(0x000000, 0xFFFFFF), 0.01)
        assertEquals(1.0, ConsentTheme.contrastRatio(0x777777, 0x777777), 0.001)
        assertEquals(4.48, ConsentTheme.contrastRatio(0x777777, 0xFFFFFF), 0.01)
    }

    @Test fun squareAndSmallThemesProduceValidCalloutOutlines() {
        for (radius in listOf(0.dp, 1.dp, 2.dp, 14.dp)) {
            RoundedCornerShape(ConsentTheme(radius = ConsentTheme.Radius(md = radius)).radius.resolvedSm)
                .createOutline(Size(300f, 120f), LayoutDirection.Ltr, Density(1f))
        }
    }

    @Test fun nonFiniteRadiusKeepsTheHostValue() {
        val base = ConsentTheme(radius = ConsentTheme.Radius(md = 10.dp))
        for (value in listOf("Infinity", "NaN")) {
            assertEquals(base, base.applying(Bundle().apply { putString(ConsentTheme.Meta.META_RADIUS_MD, value) }, context))
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
        assertEquals(ConsentTheme.HeadlineFont.SansSerif, ConsentTheme.c15t.typography.headlineFont)
        assertEquals(androidx.compose.ui.text.font.FontFamily.Default, ConsentTheme.c15t.typography.headlineFont.family)
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
