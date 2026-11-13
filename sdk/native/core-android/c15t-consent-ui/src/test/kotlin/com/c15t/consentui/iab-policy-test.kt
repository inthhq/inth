package com.c15t.consentui

import androidx.activity.ComponentDialog
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import com.c15t.consentui.generated.IabCopy
import com.c15t.core.ConsentCore
import com.c15t.core.CommitIntent
import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabBannerSummary
import com.c15t.core.iab.IabChoices
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.iab.IabLegalBasis
import com.c15t.core.spi.*
import com.c15t.core.store.C15tStore
import com.c15t.core.tc.TcStringDecoder
import com.c15t.core.transport.HostedTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.robolectric.annotation.GraphicsMode
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowDialog
import java.io.File
import java.lang.reflect.Modifier as JavaModifier

/**
 * IAB Europe's policy checks for non-web CMPs, asserted on the rendered Compose screens. Each
 * `TCF-CHECK` marker names the form questions (native/protocol/iab/tcf-policy-checks.json) that
 * the test below it proves.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@LooperMode(LooperMode.Mode.PAUSED)
@OptIn(ExperimentalCoroutinesApi::class)
class IabPolicyTest {
    @get:Rule val compose = createComposeRule()
    private val en = IabCopy.forLanguage("en")

    @Before fun main() { Dispatchers.setMain(Dispatchers.Unconfined) }
    @After fun reset() { Dispatchers.resetMain() }

    // MARK: First layer

    // TCF-CHECK: P1
    @Test fun firstLayerCoversTheWholeScreen() {
        show(boot())
        compose.onNodeWithTag("c15t.first-layer").assertIsDisplayed()
        val root = compose.onNode(isRoot() and hasAnyDescendant(hasTestTag("c15t.first-layer"))).fetchSemanticsNode()
        val display = RuntimeEnvironment.getApplication().resources.displayMetrics
        assertEquals(display.widthPixels, root.size.width)
        assertTrue("first layer is ${root.size.height}px of ${display.heightPixels}px", root.size.height >= display.heightPixels * 0.9)
    }

    // TCF-CHECK: P2
    @Test fun firstLayerIsItsOwnScreenWithThePrivacyPolicyOnlyAsALink() {
        val core = boot()
        compose.setContent {
            Column {
                Text("Terms of service: by using this app you agree to them.", Modifier.testTag("host.terms"))
                C15tConsent(remember { ConsentPresenter(core) }, POLICY)
            }
        }
        compose.onNodeWithTag("c15t.first-layer").assertIsDisplayed()
        // The host's own content is not part of the consent screen.
        compose.onNode(hasTestTag("host.terms") and hasAnyAncestor(hasTestTag("c15t.first-layer"))).assertDoesNotExist()
        assertTrue(compose.onAllNodes(hasAnyAncestor(hasTestTag("c15t.first-layer")) and hasText("Terms of service", substring = true)).fetchSemanticsNodes().isEmpty())
        // The privacy policy is a link out of the screen, never its text.
        compose.onNode(hasTestTag("c15t.privacy-policy") and hasAnyAncestor(hasTestTag("c15t.first-layer"))).performScrollTo()
            .assertHasClickAction().assertTextEquals(en.preferenceCenterVendorListPrivacyPolicy)
    }

    // TCF-CHECK: P3, P4, P5, P6, P12
    @Test fun firstLayerDescribesStorageAndProcessingWithTheCountAsTheWayToPartners() {
        val presenter = show(boot())
        val summary = presenter.disclosure!!.bannerSummary
        // Three IAB vendors and two Google ad tech providers.
        assertEquals(5, summary.vendorCount)
        val description = compose.onNodeWithTag("c15t.first-layer.description").performScrollTo().fetchSemanticsNode()
            .config[SemanticsProperties.Text].joinToString("") { it.text }
        assertEquals(en.format(en.appDescription, mapOf("partnerCount" to "5")), description)
        assertTrue(description, description.contains("store and/or access information on your device")) // P3
        assertTrue(description, description.contains("process personal data")) // P4
        assertTrue(description, description.contains("such as unique identifiers and browsing data")) // P5
        assertTrue(description, description.contains("5 partners")) // P12
        compose.onNodeWithTag("c15t.first-layer.partner-count").assertContentDescriptionEquals("5 partners")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)).performClick() // P6
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendors").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("c15t.iab.vendors.vendor.1").assertIsDisplayed()
        // The count includes the two ad tech providers, so the list it opens leads to them too.
        compose.onNode(hasScrollToNodeAction() and hasAnyAncestor(hasTestTag("c15t.iab.vendors"))).performScrollToNode(hasTestTag("c15t.iab.vendors.other-partners"))
        compose.onNodeWithTag("c15t.iab.vendors.other-partners").assertTextContains("2", substring = true).performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.ac").fetchSemanticsNodes().isNotEmpty() }
        for (provider in presenter.disclosure!!.adTechProviders!!) compose.onNode(hasAnyAncestor(hasTestTag("c15t.ac")) and hasText(provider.name)).assertExists()
    }

    // TCF-CHECK: P6
    // Native graphics, so the text is measured and wraps as it would on a device.
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    @Test fun aWrappedPartnerLinkOnlyClaimsItsOwnGlyphs() {
        val span = "many many many partners here"
        val text = "We and our $span store information"
        val range = text.indexOf(span) until text.indexOf(span) + span.length
        var layout: TextLayoutResult? = null
        compose.setContent {
            Text(text, Modifier.width(120.dp), style = TextStyle(fontSize = 16.sp), onTextLayout = { layout = it })
        }
        compose.waitForIdle()
        val result = layout!!
        val lines = inlineSpanLineBounds(result, range)
        assertTrue("the span should wrap at this width, got ${lines.size} line(s)", lines.size > 1)
        fun claimed(offset: Int) = result.getBoundingBox(offset).center.let { c -> lines.any { it.contains(c) } }
        for (offset in text.indices) {
            if (text[offset] == ' ') continue
            if (offset in range) assertTrue("span glyph $offset is not tappable", claimed(offset))
            else assertFalse("paragraph glyph $offset '${text[offset]}' is tappable", claimed(offset))
        }
    }

    // TCF-CHECK: P7
    @Test fun firstLayerSummaryIsTheBannerSummaryWithTheRestCounted() {
        val presenter = show(boot(widerList))
        val summary = presenter.disclosure!!.bannerSummary
        assertEquals(IabBannerSummary.MAX_DISPLAY_ITEMS, summary.displayItems.size)
        assertTrue(summary.remainingCount > 0)
        summary.displayItems.forEachIndexed { index, name ->
            compose.onNodeWithTag("c15t.first-layer.summary.item.$index").performScrollTo().assertTextEquals(name)
        }
        compose.onNodeWithTag("c15t.first-layer.summary.more").performScrollTo()
            .assertTextEquals(en.format(en.bannerAndMore, mapOf("count" to "${summary.remainingCount}")))
        // Purpose 2 is in the list but no partner declares it.
        assertTrue(compose.onAllNodes(hasText("Use limited data to select advertising")).fetchSemanticsNodes().isEmpty())
    }

    // TCF-CHECK: P8, P9, P17, P18
    @Test fun legitimateInterestScopeAndWithdrawalAlwaysShowUnderHostCopy() {
        val host = ConsentTheme(copy = ConsentTheme.Copy(headline = "Before you shop.", introduction = "Pantry uses data to run the store."))
        show(boot(), host)
        compose.onNodeWithTag("c15t.first-layer.title").assertTextEquals("Before you shop.")
        compose.onNodeWithTag("c15t.first-layer.body").assertTextEquals("Pantry uses data to run the store.")
        compose.onNodeWithTag("c15t.first-layer.legitimate-interest").performScrollTo().assertTextEquals(en.bannerLegitimateInterestNotice)
            .assertTextContains("legitimate interest", substring = true) // P17
            .assertTextContains("right to object", substring = true) // P18
        compose.onNodeWithTag("c15t.first-layer.scope").performScrollTo().assertTextEquals(en.appScopeServiceSpecific)
            .assertTextContains("only to this app", substring = true) // P8
        compose.onNodeWithTag("c15t.first-layer.withdraw").performScrollTo().assertTextEquals(en.appWithdraw)
            .assertTextContains("withdraw your consent at any time from Privacy settings", substring = true) // P9
    }

    // TCF-CHECK: P10
    @Test fun firstLayerOffersAcceptRejectAndCustomize() {
        val presenter = show(boot())
        compose.onNodeWithTag("c15t.first-layer.accept-all").assertContentDescriptionEquals(en.commonAcceptAll).assertHasClickAction()
        compose.onNodeWithTag("c15t.first-layer.reject-all").assertContentDescriptionEquals(en.commonRejectAll).assertHasClickAction()
        compose.onNodeWithTag("c15t.first-layer.customize").assertContentDescriptionEquals(en.commonCustomize).performClick()
        compose.waitUntil(5_000) { presenter.preferences }
        compose.onNodeWithTag("c15t.iab").assertIsDisplayed()
    }

    // TCF-CHECK: P11
    @Test fun primaryActionsShareTheirTextTreatmentAndReachFiveToOne() {
        // A host decision pair under 5:1 is replaced by the stock pair before anything draws.
        val unreadable = ConsentTheme(colors = ConsentTheme.Colors.c15t.copy(decision = ConsentThemeColor(0x8CA2FF), textOnDecision = ConsentThemeColor(0xFFFFFF)))
        show(boot(), unreadable)
        val accept = buttonLabel("c15t.first-layer.accept-all", en.commonAcceptAll)
        val reject = buttonLabel("c15t.first-layer.reject-all", en.commonRejectAll)
        assertEquals(accept.fontSize, reject.fontSize)
        assertEquals(accept.fontWeight, reject.fontWeight)
        assertEquals(accept.fontFamily, reject.fontFamily)
        assertEquals(accept.fontStyle, reject.fontStyle)
        assertEquals(FontWeight.SemiBold, accept.fontWeight)
        assertEquals(accept.color, reject.color)
        val stock = ConsentTheme.Colors.c15t
        assertEquals(stock.textOnDecision.light, accept.color.toArgb() and 0xFFFFFF)
        assertTrue(ConsentTheme.contrastRatio(accept.color.toArgb() and 0xFFFFFF, stock.decision.light) >= 5.0)
        val a = compose.onNodeWithTag("c15t.first-layer.accept-all").fetchSemanticsNode().size
        val r = compose.onNodeWithTag("c15t.first-layer.reject-all").fetchSemanticsNode().size
        assertEquals(a, r)
    }

    // TCF-CHECK: P13, P29
    @Test fun standardTextsAreNotReplaceableSoUseNonStandardTextsStaysZero() {
        // The only host copy is the headline and introduction: no stack, purpose or illustration text.
        val copyFields = ConsentTheme.Copy::class.java.declaredFields.filterNot { JavaModifier.isStatic(it.modifiers) }.map { it.name }.toSet()
        assertEquals(setOf("headline", "introduction"), copyFields)
        val themeFields = ConsentTheme::class.java.declaredFields.map { it.name.lowercase() }
        assertTrue(themeFields.toString(), themeFields.none { "stack" in it || "illustration" in it || "purpose" in it })
        // Under host copy, the first layer still lists the list's own names and the second its own illustrations.
        val core = boot()
        val presenter = show(core, ConsentTheme(copy = ConsentTheme.Copy(headline = "Hello", introduction = "Custom")))
        val list = presenter.disclosure!!.list
        presenter.disclosure!!.bannerSummary.displayItems.forEachIndexed { index, name ->
            compose.onNodeWithTag("c15t.first-layer.summary.item.$index").performScrollTo().assertTextEquals(name)
        }
        compose.onNodeWithTag("c15t.first-layer.customize").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab").fetchSemanticsNodes().isNotEmpty() }
        scroll("c15t.iab.purpose.1.details").performClick()
        assertIllustrations("c15t.iab.purpose.1.illustrations", list.purposes.getValue(1).illustrations!!)
        compose.onNodeWithTag("c15t.prefs.cancel").performClick()
        compose.waitUntil(5_000) { !presenter.preferences }
        compose.onNodeWithTag("c15t.first-layer.accept-all").performClick()
        compose.waitUntil(5_000) { presenter.presentationID == null }
        val tc = TcStringDecoder.decode(core.iabConsent!!.tcString)
        assertFalse(tc.core.useNonStandardTexts)
    }

    @Test fun firstLayerTextFallsBackToTheNumberWhenTheLinkWordsDiffer() {
        val summary = IabBannerSummary(vendorCount = 12, displayItems = listOf("A"), remainingCount = 0)
        val english = com.c15t.consentui.headless.iabFirstLayer(en, summary)
        assertEquals("12 partners", english.partnersLabel)
        assertEquals(listOf("A"), english.summary)
        // Polish inflects "partners" differently in the sentence and the link, so only the number is tappable.
        assertEquals("12", com.c15t.consentui.headless.iabFirstLayer(IabCopy.forLanguage("pl"), summary).partnersLabel)
    }

    @Test fun backKeepsTheIabFirstLayerUntilADecisionAndLeavesCustomizeForIt() {
        val core = boot()
        val presenter = show(core)
        var outcomes = 0
        presenter.onOutcome = { outcomes++ }
        val session = presenter.presentationID
        assertNotNull(session)
        pressBack()
        compose.onNodeWithTag("c15t.first-layer.accept-all").assertIsDisplayed()
        assertEquals(session, presenter.presentationID)
        compose.onNodeWithTag("c15t.first-layer.customize").performClick()
        compose.waitUntil(5_000) { presenter.preferences }
        pressBack()
        compose.waitUntil(5_000) { !presenter.preferences }
        compose.onNodeWithTag("c15t.first-layer.accept-all").assertIsDisplayed()
        assertEquals(session, presenter.presentationID)
        assertEquals(0, outcomes)
        assertNull(core.snapshot().explicitChoice)
    }

    @Test fun backStillClosesStandingPreferences() {
        val core = boot()
        assertTrue(core.save(CommitIntent.All).ok)
        val presenter = show(core)
        compose.runOnIdle { presenter.presentPreferences() }
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab").fetchSemanticsNodes().isNotEmpty() }
        pressBack()
        compose.waitUntil(5_000) { presenter.presentationID == null }
    }

    // MARK: Second layer

    // TCF-CHECK: P14, P20
    @Test fun secondLayerListsOnlyDeclaredPurposesAndSpecialFeaturesByStandardName() {
        val presenter = customize(boot(widerList))
        val d = presenter.disclosure!!
        assertEquals(listOf(1, 3, 4, 5, 6, 7, 8), d.declaredPurposeIds)
        assertEquals(listOf(1), d.declaredSpecialFeatureIds)
        for (id in d.declaredPurposeIds) scroll("c15t.iab.purpose.$id.consent").assertTextContains(d.list.purposes.getValue(id).name!!, substring = true)
        assertNoRow("c15t.iab.purpose.2.consent")
        assertNoRow("c15t.iab.special-feature.2.switch")
        val feature = scroll("c15t.iab.special-feature.1.switch").assertTextContains(d.list.specialFeatures!!.getValue(1).name!!, substring = true).assertIsOff()
        feature.performClick().assertIsOn()
        assertEquals(listOf(1), presenter.choices.specialFeatureOptIns)
        feature.performClick().assertIsOff()
        assertEquals(emptyList<Int>(), presenter.choices.specialFeatureOptIns)
    }

    // TCF-CHECK: P15
    @Test fun purposesSpecialPurposesFeaturesAndSpecialFeaturesShowTheirStandardIllustrations() {
        val presenter = customize(boot())
        val list = presenter.disclosure!!.list
        scroll("c15t.iab.purpose.7.details").performClick()
        assertIllustrations("c15t.iab.purpose.7.illustrations", list.purposes.getValue(7).illustrations!!)
        val kinds = listOf(
            "c15t.iab.special-feature.1" to list.specialFeatures!!.getValue(1),
            "c15t.iab.special-purpose.1" to list.specialPurposes!!.getValue(1),
            "c15t.iab.feature.1" to list.features!!.getValue(1),
        )
        for ((id, item) in kinds) {
            scroll("$id.examples").assertTextEquals("${en.preferenceCenterPurposeItemExamples} (${item.illustrations!!.size})").performClick()
            assertIllustrations("$id.illustrations", item.illustrations!!)
        }
    }

    // TCF-CHECK: P14, P15
    @Test fun featuresCarryTheStandardExplanationWhereverTheyAreListed() {
        val presenter = customize(boot())
        val list = presenter.disclosure!!.list
        val standard = list.standardTexts!!.features
        scroll("c15t.iab.features-standard-text").assertTextEquals(standard)
        openVendor(1)
        val feature = list.features!!.getValue(1)
        val row = "c15t.iab.vendor.1.feature.1"
        compose.onNodeWithTag(row).performScrollTo()
            .assert(hasAnyDescendant(hasText(feature.name!!)))
            .assert(hasAnyDescendant(hasText(feature.description!!)))
        // Read-only: no switch, only "No choice".
        compose.onNodeWithTag("$row.status").assertTextEquals(en.appNoChoice)
        compose.onAllNodes(isToggleable() and hasAnyAncestor(hasTestTag(row))).assertCountEquals(0)
        compose.onNodeWithTag("$row.examples").performScrollTo().performClick()
        val shown = compose.onAllNodes(hasAnyAncestor(hasTestTag("$row.illustrations"))).fetchSemanticsNodes()
            .flatMap { it.config.getOrNull(SemanticsProperties.Text).orEmpty() }.map { it.text }
        assertEquals(feature.illustrations!!.map { "• $it" }, shown)
        compose.onNodeWithTag("c15t.iab.vendor.1.features-standard-text").performScrollTo().assertTextEquals(standard)
    }

    @Test fun noFeaturesMeansNoFeaturesExplanation() {
        customize(boot { gvl ->
            val vendors = gvl.getValue("vendors").jsonObject.mapValues { (_, v) -> JsonObject(v.jsonObject + ("features" to JsonArray(emptyList()))) }
            JsonObject(gvl + ("vendors" to JsonObject(vendors)))
        })
        scroll("c15t.iab.partners")
        assertNoRow("c15t.iab.features-standard-text")
    }

    @Test fun featuresFallBackToTheTranslatedStandardText() {
        val presenter = customize(boot { JsonObject(it - "standardTexts") })
        assertEquals(null, presenter.disclosure!!.list.standardTexts)
        scroll("c15t.iab.features-standard-text").assertTextEquals(en.preferenceCenterFeaturesDescription)
        openVendor(1)
        compose.onNodeWithTag("c15t.iab.vendor.1.features-standard-text").performScrollTo().assertTextEquals(en.preferenceCenterFeaturesDescription)
    }

    // TCF-CHECK: P16, P25
    @Test fun adTechProviderPurposesLeadToTheProvidersFromTheirPartnerList() {
        customize(boot())
        scroll("c15t.iab.purpose.1.details").performClick()
        scroll("c15t.iab.purpose.1.view-partners").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendors").fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasScrollToNodeAction() and hasAnyAncestor(hasTestTag("c15t.iab.vendors"))).performScrollToNode(hasTestTag("c15t.iab.vendors.other-partners"))
        compose.onNodeWithTag("c15t.iab.vendors.other-partners").assertTextContains("2", substring = true)
        compose.onNode(hasAnyAncestor(hasTestTag("c15t.iab.vendors")) and hasText(en.preferenceCenterVendorListAdTechProvidersNotice)).assertExists()
    }

    // TCF-CHECK: P16, P21
    @Test fun customPartnersArePresentedApartWithTheirOwnChoices() {
        val vendors = Json.parseToJsonElement("""[{"id":"internal-ads","name":"Internal ads","privacyPolicyUrl":"https://example.test/ads",
            "purposes":[1,3],"legIntPurposes":[7],"usesCookies":true,"cookieMaxAgeSeconds":3600}]""").jsonArray
        val core = bootIn("EN", customVendors = vendors)
        val presenter = customize(core)
        scroll("c15t.iab.custom-partners").assertTextContains(en.preferenceCenterVendorListCustomVendorsHeading, substring = true)
            .assertTextContains("1", substring = true).performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.custom-vendors").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("c15t.iab.custom-vendors.intro").assertTextEquals(en.preferenceCenterVendorListCustomVendorsNotice)
        compose.onNodeWithTag("c15t.iab.custom-vendors.vendor.internal-ads").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.custom-vendor.internal-ads").fetchSemanticsNodes().isNotEmpty() }
        // Labelled as not registered with IAB, in the web's words, and off for a first-time user.
        compose.onNodeWithTag("c15t.iab.custom-vendor.internal-ads.note").assertTextEquals(en.commonCustomPartner)
        compose.onNodeWithTag("c15t.iab.custom-vendor.internal-ads.li").assertIsOff()
        compose.onNodeWithTag("c15t.iab.custom-vendor.internal-ads.consent").assertIsOff().performClick().assertIsOn()
        assertEquals(listOf("internal-ads"), presenter.choices.customVendorConsents)
        assertEquals(emptyList<String>(), presenter.choices.customVendorLegitimateInterests)
        // Not among the IAB partners.
        assertTrue(presenter.disclosure!!.vendors.values.isNotEmpty())
        assertEquals(listOf("internal-ads"), presenter.disclosure!!.customVendors.map { it.id })
    }

    @Test fun lastChangedDateUsesTheCopyLanguage() {
        val march5 = 1_772_668_800_000L // 2026-03-05
        val german = ConsentPresenter(bootIn("DE")).lastChanged(march5)
        val english = ConsentPresenter(boot()).lastChanged(march5)
        // The sentence and its date share one language, whatever the device locale.
        assertTrue(german, german.contains("März") || german.contains("05.03.2026"))
        assertTrue(english, english.contains("Mar"))
    }

    @Test fun screenCopyFollowsTheConfiguredConsentLanguage() {
        val core = bootIn("DE")
        // The TC String declares DE, so the screens use the German copy too.
        assertEquals("DE", core.iabPresentation()!!.language)
        val german = IabCopy.forLanguage("de")
        assertTrue(german.appWithdraw != en.appWithdraw)
        assertEquals(german.appWithdraw, ConsentPresenter(core).iabCopy.appWithdraw)
    }

    // TCF-CHECK: P21
    @Test fun firstTimeConsentsStartOff() {
        val presenter = customize(boot())
        val choices = presenter.choices
        assertEquals(IabChoices(), choices.copy(purposeLegitimateInterests = emptyList(), vendorLegitimateInterests = emptyList()))
        // Legitimate interest is not consent: as on the web it starts not objected to, and the
        // user objects with its switch.
        assertEquals(listOf(7), choices.purposeLegitimateInterests)
        assertEquals(listOf(1, 2, 3), choices.vendorLegitimateInterests)
        for (id in presenter.disclosure!!.declaredPurposeIds) scroll("c15t.iab.purpose.$id.consent").assertIsOff()
        scroll("c15t.iab.special-feature.1.switch").assertIsOff()
        scroll("c15t.iab.purpose.7.details").performClick()
        scroll("c15t.iab.purpose.7.li").assertIsOn()
        openVendor(1)
        compose.onNodeWithTag("c15t.iab.vendor.1.consent").assertIsOff()
        compose.onNodeWithTag("c15t.iab.vendor.1.li").assertIsOn()
    }

    // TCF-CHECK: P17, P18, P22, P23, P25
    @Test fun purposeRowsCountPartnersExplainLegitimateInterestAndAllowObjection() {
        val presenter = customize(boot())
        // The counts sit on the collapsed row, before Details.
        scroll("c15t.iab.purpose.7.consent").assertTextContains("With Your Permission: 3 partners · Legitimate Interest: 3 partners", substring = true) // P25
        // Purposes 1, 3 and 4 also count the 2 Google ad tech providers, as the web does.
        assertEquals(2, presenter.disclosure!!.adTechProviders!!.size)
        scroll("c15t.iab.purpose.1.consent").assertTextContains("With Your Permission: 5 partners · Legitimate Interest: 0 partners", substring = true) // P25
        compose.onNodeWithTag("c15t.iab.purpose.7.li").assertDoesNotExist()
        scroll("c15t.iab.purpose.7.details").performClick()
        scroll("c15t.iab.purpose.7.li-explanation").assertTextEquals(en.appLegitimateInterestExplanation) // P17, P22
            .assertTextContains("such as unique identifiers and browsing data", substring = true)
            .assertTextContains("only to this app", substring = true)
            .assertTextContains("right to object", substring = true) // P18
        // Objecting per purpose.
        val li = scroll("c15t.iab.purpose.7.li").assertTextContains("Turn off to object.", substring = true)
        li.assertIsOn().performClick().assertIsOff()
        assertEquals(listOf(7), presenter.choices.purposeObjections) // P23
        // Objecting per partner.
        openVendor(1)
        compose.onNodeWithTag("c15t.iab.vendor.1.li-explanation").performScrollTo().assertTextEquals(en.appLegitimateInterestExplanation)
        val vendorLi = compose.onNodeWithTag("c15t.iab.vendor.1.li").performScrollTo()
        vendorLi.assertIsOn().performClick().assertIsOff()
        assertEquals(listOf(1), presenter.choices.vendorObjections) // P23
    }

    // TCF-CHECK: P19, P26, P27, P28
    @Test fun vendorPageShowsDeclarationsLegalBasesRetentionAndPerPartnerChoices() {
        val presenter = customize(boot(widerList))
        scroll("c15t.iab.partners").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendors.vendor.2").fetchSemanticsNodes().isNotEmpty() }
        for (id in presenter.disclosure!!.vendors.keys) compose.onNodeWithTag("c15t.iab.vendors.vendor.$id").assertExists()
        compose.onNodeWithTag("c15t.iab.vendors.vendor.2").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendor.2.consent").fetchSemanticsNodes().isNotEmpty() }
        val list = presenter.disclosure!!.list
        compose.onNodeWithTag("c15t.iab.vendor.2.privacy-link").assertHasClickAction() // P19
        compose.onNodeWithTag("c15t.iab.vendor.2.li-claim-link").assertHasClickAction().assertTextEquals("Legitimate interest statement") // P26
        compose.onNodeWithTag("c15t.iab.vendor.2.consent").assertTextContains(list.purposes.getValue(1).name!!, substring = true)
            .performClick().assertIsOn()
        assertEquals(listOf(2), presenter.choices.vendorConsents) // P19: a choice per partner
        compose.onNodeWithTag("c15t.iab.vendor.2.li").assertTextContains(list.purposes.getValue(7).name!!, substring = true)
        for (text in listOf(en.preferenceCenterVendorListSpecialPurposes, list.specialPurposes!!.getValue(1).name!!, en.preferenceCenterFeaturesTitle, list.features!!.getValue(1).name!!,
            en.preferenceCenterVendorListSpecialFeatures, list.specialFeatures!!.getValue(1).name!!)) onPage(2, text).performScrollTo().assertIsDisplayed() // P19
        onPage(2, en.appDataCollected).performScrollTo().assertIsDisplayed()
        onPage(2, list.dataCategories!!.getValue(1).name!!).performScrollTo().assertIsDisplayed() // P28
        // Retention for a purpose, a special purpose and the standard period.
        inRetention(2, list.purposes.getValue(7).name!!).assertExists()
        inRetention(2, list.specialPurposes!!.getValue(1).name!!).assertExists() // P27
        inRetention(2, "30 days").assertExists()
        inRetention(2, "Standard retention").assertExists()
        inRetention(2, "365 days").assertExists()
        // An hour of device storage rounds up to a day.
        compose.onNode(hasAnyAncestor(hasTestTag("c15t.iab.vendor.2.storage")) and hasText("1 day")).performScrollTo().assertIsDisplayed()
    }

    // TCF-CHECK: P28
    @Test fun vendorPageListsTheDataCategoriesARealListDeclares() {
        // A served GVL v3 vendor names its categories in `dataDeclaration`.
        val fixture = Json.parseToJsonElement(generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "native/protocol/iab/accept-all-declared-signals.json") }.first { it.exists() }.readText()).jsonObject
        val expected = fixture.getValue("vendorDataCategories").jsonObject.getValue("21").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(10, expected.size)
        val presenter = customize(boot { fixture.getValue("gvl").jsonObject })
        assertEquals(listOf(1L, 2L, 3L, 4L, 5L, 6L, 8L, 9L, 10L, 11L), presenter.disclosure!!.list.vendors.getValue(21).dataCategories)
        scroll("c15t.iab.partners").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendors").fetchSemanticsNodes().isNotEmpty() }
        // The partner list composes lazily; scroll it to the row.
        compose.onNode(hasScrollToNodeAction() and hasAnyAncestor(hasTestTag("c15t.iab.vendors")))
            .performScrollToNode(hasTestTag("c15t.iab.vendors.vendor.21"))
        compose.onNodeWithTag("c15t.iab.vendors.vendor.21").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendor.21.consent").fetchSemanticsNodes().isNotEmpty() }
        onPage(21, en.appDataCollected).performScrollTo().assertIsDisplayed()
        for (name in expected) onPage(21, name).performScrollTo().assertIsDisplayed()
    }

    // TCF-CHECK: P16
    @Test fun nonIabPartnersArePresentedApart() {
        val presenter = customize(boot())
        val providers = presenter.disclosure!!.adTechProviders!!.map { it.name }
        assertEquals(listOf("Harbour Ads", "Cedar Measurement"), providers)
        scroll("c15t.iab.partners").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendors.vendor.1").fetchSemanticsNodes().isNotEmpty() }
        for (name in providers) assertTrue(compose.onAllNodes(hasAnyAncestor(hasTestTag("c15t.iab.vendors")) and hasText(name)).fetchSemanticsNodes().isEmpty())
        compose.onNodeWithTag("c15t.iab.vendors.back").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab").fetchSemanticsNodes().isNotEmpty() }
        // Labelled from the shared IAB copy, like the web.
        scroll("c15t.iab.other-partners").assertTextContains(en.preferenceCenterVendorListAdTechProvidersHeading, substring = true)
            .assertTextContains("2", substring = true).performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.ac").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("c15t.prefs.title").assertTextEquals(en.preferenceCenterVendorListAdTechProvidersHeading)
        for (name in providers) compose.onNode(hasAnyAncestor(hasTestTag("c15t.ac")) and hasText(name)).assertExists()
    }

    // TCF-CHECK: P30
    @Test fun preferencesSayWhereTheChoiceIsStoredAndForHowLong() {
        val presenter = customize(boot())
        assertEquals(365, presenter.disclosure!!.consentStorageMaxDays)
        scroll("c15t.iab.consent-storage").assertTextEquals(en.format(en.appConsentStorage, mapOf("days" to "365")))
            .assertTextContains("IABTCF", substring = true).assertTextContains("up to 365 days", substring = true)
        assertEquals("1 day", storageDuration(1, en))
        assertEquals("1 day", storageDuration(3_600, en))
        assertEquals("1 day", storageDuration(86_400, en))
        assertEquals("2 days", storageDuration(86_401, en))
        assertEquals("365 days", storageDuration(31_536_000, en))
        assertEquals(en.appSessionOnly, storageDuration(0, en))
    }

    // MARK: Resurfacing

    // TCF-CHECK: P31
    @Test fun publicPresentPreferencesReopensTheChoiceAfterADecision() {
        val method = ConsentPresenter::class.java.getMethod("presentPreferences")
        assertTrue(JavaModifier.isPublic(method.modifiers))
        val presenter = show(boot())
        compose.onNodeWithTag("c15t.first-layer.accept-all").performClick()
        compose.waitUntil(5_000) { presenter.presentationID == null }
        compose.onNodeWithTag("c15t.first-layer").assertDoesNotExist()
        compose.runOnIdle { presenter.presentPreferences() }
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab").fetchSemanticsNodes().isNotEmpty() }
        assertTrue(presenter.preferences)
        compose.onNodeWithTag("c15t.prefs.title").assertTextEquals(en.preferenceCenterTitle)
    }

    // TCF-CHECK: P32
    @Test fun reopenedPreferencesWithdrawAsEasilyAsAcceptAll() {
        val core = boot()
        val presenter = show(core)
        compose.onNodeWithTag("c15t.first-layer.accept-all").performClick()
        compose.waitUntil(5_000) { presenter.presentationID == null }
        assertTrue(core.isIabAllowed(1, 7, IabLegalBasis.CONSENT))
        compose.runOnIdle { presenter.presentPreferences() }
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.reject-all").fetchSemanticsNodes().isNotEmpty() }
        val reject = compose.onNodeWithTag("c15t.iab.reject-all").assertIsDisplayed().assertContentDescriptionEquals(en.commonRejectAll)
        val accept = compose.onNodeWithTag("c15t.iab.accept-all").assertIsDisplayed().assertContentDescriptionEquals(en.commonAcceptAll)
        // Save takes the shared copy too, not an English literal.
        compose.onNodeWithTag("c15t.iab.save").assertContentDescriptionEquals(en.commonSaveSettings)
        val r = reject.fetchSemanticsNode().boundsInRoot
        val a = accept.fetchSemanticsNode().boundsInRoot
        // One tap, side by side, the same size.
        assertEquals(r.top, a.top, 1f); assertEquals(r.width, a.width, 1f); assertEquals(r.height, a.height, 1f)
        reject.performClick()
        compose.waitUntil(5_000) { presenter.presentationID == null }
        assertFalse(core.isIabAllowed(1, 7, IabLegalBasis.CONSENT))
        assertFalse(core.isIabAllowed(1, 7, IabLegalBasis.LEGITIMATE_INTEREST))
        assertTrue(TcStringDecoder.decode(core.iabConsent!!.tcString).core.purposeConsents.isEmpty())
    }

    // MARK: Helpers

    /** The text style a button's label was laid out with. */
    private fun buttonLabel(tag: String, text: String): TextStyle {
        val node = compose.onNode(hasText(text) and hasAnyAncestor(hasTestTag(tag)), useUnmergedTree = true).fetchSemanticsNode()
        val results = mutableListOf<TextLayoutResult>()
        node.config[SemanticsActions.GetTextLayoutResult].action!!.invoke(results)
        return results.single().layoutInput.style
    }

    /** System Back, delivered the way the platform does to the consent dialog. */
    private fun pressBack() {
        val dialog = ShadowDialog.getLatestDialog() as ComponentDialog
        compose.runOnUiThread { dialog.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    /** Preferences compose rows lazily; scroll the page until the row exists. */
    private fun scroll(id: String): SemanticsNodeInteraction {
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag(id))
        return compose.onNodeWithTag(id)
    }

    private fun assertNoRow(id: String) {
        assertThrows(AssertionError::class.java) { compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag(id)) }
    }

    private fun openVendor(id: Int) {
        scroll("c15t.iab.partners").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendors.vendor.$id").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("c15t.iab.vendors.vendor.$id").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab.vendor.$id.consent").fetchSemanticsNodes().isNotEmpty() }
    }

    private fun onPage(vendor: Int, text: String) = compose.onAllNodes(hasAnyAncestor(hasTestTag("c15t.iab.vendor.$vendor")) and hasText(text)).onFirst()

    /** Every illustration the list gives, verbatim and in order, under [id]. */
    private fun assertIllustrations(id: String, illustrations: List<String>) {
        scroll(id)
        val shown = compose.onAllNodes(hasAnyAncestor(hasTestTag(id))).fetchSemanticsNodes()
            .flatMap { it.config.getOrNull(SemanticsProperties.Text).orEmpty() }.map { it.text }
        assertEquals(illustrations.map { "• $it" }, shown)
    }
    private fun inRetention(vendor: Int, text: String) = compose.onNode(hasAnyAncestor(hasTestTag("c15t.iab.vendor.$vendor.retention")) and hasText(text))

    private fun customize(core: ConsentCore): ConsentPresenter {
        val presenter = show(core)
        compose.onNodeWithTag("c15t.first-layer.customize").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithTag("c15t.iab").fetchSemanticsNodes().isNotEmpty() }
        return presenter
    }

    private fun show(core: ConsentCore, theme: ConsentTheme? = null): ConsentPresenter {
        lateinit var presenter: ConsentPresenter
        compose.setContent {
            presenter = remember { ConsentPresenter(core) }
            C15tConsent(presenter, POLICY, theme = theme)
        }
        compose.waitForIdle()
        return presenter
    }

    /** The demo's IAB fixture, with [edit] applied to its vendor list. */
    private fun boot(edit: (JsonObject) -> JsonObject = { it }): ConsentCore = bootIn("EN", edit)

    private fun bootIn(language: String, edit: (JsonObject) -> JsonObject = { it }, customVendors: JsonArray? = null): ConsentCore {
        val source = Json.parseToJsonElement(generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "native/examples/consent-demo/fixtures/iab-init.json") }.first { it.exists() }.readText()).jsonObject
        val served = source + ("gvl" to edit(source.getValue("gvl").jsonObject))
        val body = JsonObject(if (customVendors == null) served else served + ("customVendors" to customVendors)).toString()
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), body) else HttpResponse(503)
        }
        val config = NativeConfig("https://fixture.invalid", iab = IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB", consentLanguage = language))
        val core = ConsentCore(config, C15tStore(Memory()), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
        core.bootstrap()
        return core
    }

    /**
     * Purposes 5, 6 and 8 declared by vendor 3, so the first layer has more than it lists; purpose 2
     * and special feature 2 in the list but declared by nobody; vendor 2 storing for one hour.
     */
    private val widerList: (JsonObject) -> JsonObject = { gvl ->
        fun entry(id: Int, name: String) = buildJsonObject {
            put("id", id); put("name", name); put("description", "$name."); put("descriptionLegal", "$name.")
            putJsonArray("illustrations") { add("An example of $name.") }
        }
        val purposes = gvl.getValue("purposes").jsonObject + mapOf("2" to entry(2, "Use limited data to select advertising"),
            "5" to entry(5, "Create profiles to personalise content"), "6" to entry(6, "Use profiles to select personalised content"),
            "8" to entry(8, "Measure content performance"))
        val specialFeatures = gvl.getValue("specialFeatures").jsonObject + ("2" to entry(2, "Actively scan device characteristics for identification"))
        val vendors = gvl.getValue("vendors").jsonObject.mapValues { (id, vendor) ->
            when (id) {
                "2" -> JsonObject(vendor.jsonObject + ("cookieMaxAgeSeconds" to JsonPrimitive(3600)))
                "3" -> JsonObject(vendor.jsonObject + ("purposes" to buildJsonArray { listOf(1, 3, 4, 5, 6, 7, 8).forEach { add(it) } }))
                else -> vendor
            }
        }
        JsonObject(gvl + mapOf("purposes" to JsonObject(purposes), "specialFeatures" to JsonObject(specialFeatures), "vendors" to JsonObject(vendors)))
    }

    private class Memory : KeyValueStore {
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
    }

    private companion object { const val POLICY = "https://app.test/privacy" }
}
