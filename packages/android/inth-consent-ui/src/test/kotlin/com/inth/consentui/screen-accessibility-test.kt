package com.inth.consentui

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.remember
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.ColorUtils
import com.inth.core.ConsentCore
import com.inth.core.CommitIntent
import com.inth.core.NativeConfig
import com.inth.core.iab.IabConfiguration
import com.inth.consentui.generated.ConsentCopy
import com.inth.core.model.ConsentCategory
import com.inth.core.model.KernelOverrides
import com.inth.core.spi.*
import com.inth.core.store.InthStore
import com.inth.core.transport.HostedTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@LooperMode(LooperMode.Mode.PAUSED)
@OptIn(ExperimentalCoroutinesApi::class)
class ScreenAccessibilityTest {
    @get:Rule val compose = createComposeRule()

    @Test fun pendingDecisionsKeepTheirAccessibleNames() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val store = DecisionStore()
        var presenter: ConsentPresenter? = null
        try {
            val active = show(store)
            presenter = active
            store.block = true
            compose.runOnIdle { active.commit(ConsentPresenter.Action.ACCEPT) }
            compose.waitUntil(5_000) { active.showProgress }
            assertEquals(ConsentPresenter.Action.ACCEPT, active.pendingAction)
            // Both decisions keep their names and lock; only the pressed one reports progress.
            for ((id, name) in listOf("accept-all" to "Accept All", "reject-all" to "Reject All")) {
                val semantics = compose.onNodeWithTag("inth.first-layer.$id").fetchSemanticsNode().config
                assertEquals(listOf(name), semantics.getOrNull(SemanticsProperties.ContentDescription))
                assertEquals(if (id == "accept-all") "Saving choices" else null, semantics.getOrNull(SemanticsProperties.StateDescription))
                assertTrue(semantics.contains(SemanticsProperties.Disabled))
            }
            val spinners = compose.onAllNodesWithTag("inth.status.progress", useUnmergedTree = true).fetchSemanticsNodes()
            assertEquals(1, spinners.size)
            val accept = compose.onNodeWithTag("inth.first-layer.accept-all").fetchSemanticsNode().boundsInRoot
            assertTrue(spinners.single().boundsInRoot.left >= accept.left && spinners.single().boundsInRoot.right <= accept.right)
        } finally {
            store.release.countDown()
            // `pending` clears before `pendingAction`, and the commit finishes off the test thread here.
            try { compose.waitUntil(5_000) { presenter?.pending != true && presenter?.pendingAction == null } }
            finally { Dispatchers.resetMain() }
        }
        assertNull(presenter?.pendingAction)
    }

    // TCF-CHECK: P11
    @Test fun lightStockSmallTextReachesFourPointFiveToOne() = assertStockSmallTextContrast(dark = false)

    // TCF-CHECK: P11
    @Test @Config(qualifiers = "night")
    fun darkStockSmallTextReachesFourPointFiveToOne() = assertStockSmallTextContrast(dark = true)

    /**
     * The small text the stock theme sets on tinted and muted fills, composited the way it renders.
     * Accept all and Reject all need 5:1, the IAB TCF floor for the first layer's primary actions.
     */
    private fun assertStockSmallTextContrast(dark: Boolean) {
        val colors = ConsentTheme.Colors.default
        fun argb(color: ConsentThemeColor) = (if (dark) color.dark else color.light) or 0xFF000000.toInt()
        val tagFill = ColorUtils.compositeColors(ColorUtils.setAlphaComponent(argb(colors.primary), Math.round(255 * 0.14f)), argb(colors.surface))
        val pairs = listOf(
            Triple("status tag text on its tint", argb(colors.statusTagText), tagFill) to 4.5,
            Triple("off tag text on muted surface", argb(colors.textMuted), argb(colors.surfaceMuted)) to 4.5,
            Triple("summary text on muted surface", argb(colors.text), argb(colors.surfaceMuted)) to 4.5,
            Triple("section label on muted surface", argb(colors.textMuted), argb(colors.surfaceMuted)) to 4.5,
            Triple("links on canvas", argb(colors.primary), argb(colors.canvas)) to 4.5,
            Triple("links on surface", argb(colors.primary), argb(colors.surface)) to 4.5,
            Triple("decision label", argb(colors.textOnDecision), argb(colors.decision)) to ConsentTheme.DECISION_CONTRAST_FLOOR,
            Triple("save label", argb(colors.textOnPrimary), argb(colors.primary)) to 4.5,
        )
        for ((pair, floor) in pairs) {
            val (name, foreground, background) = pair
            val ratio = ColorUtils.calculateContrast(foreground, background)
            assertTrue("$name (${if (dark) "dark" else "light"}) was $ratio, needs $floor", ratio >= floor)
        }
    }

    /** The colour and size a text node was laid out with, from the layout Compose drew. */
    private fun drawnStyle(tag: String): androidx.compose.ui.text.TextStyle {
        val node = compose.onNodeWithTag(tag, useUnmergedTree = true).fetchSemanticsNode()
        val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        node.config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
        return layouts.single().layoutInput.style
    }

    @Test fun titleAndDescriptionSlotsReachTheFirstLayer() {
        val theme = ConsentTheme(slots = mapOf(
            ConsentTheme.Slot.ConsentBannerTitle to ConsentTheme.SlotStyle(color = ConsentThemeColor(0x8A1C7C), fontSize = 40.sp),
            ConsentTheme.Slot.ConsentBannerDescription to ConsentTheme.SlotStyle(color = ConsentThemeColor(0x123456)),
        ))
        show(DecisionStore(), theme)
        val title = drawnStyle("inth.first-layer.title")
        assertEquals(0x8A1C7C, title.color.toArgb() and 0xFFFFFF)
        assertEquals(40.sp, title.fontSize)
        assertEquals(0x123456, drawnStyle("inth.first-layer.body").color.toArgb() and 0xFFFFFF)
    }

    @Test fun squareThemeCanShowAWriteRefusal() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val store = DecisionStore()
            val presenter = show(store, ConsentTheme(radius = ConsentTheme.Radius(md = 0.dp)))
            store.refuseNext = true
            compose.runOnIdle { presenter.commit(ConsentPresenter.Action.REJECT) }
            compose.waitUntil(5_000) { presenter.errorMessage != null }
            compose.onNodeWithTag("inth.first-layer.error").assertIsDisplayed()
            compose.onNodeWithTag("inth.first-layer.error.retry").assertIsDisplayed()
            assertNotNull(presenter.presentationID)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun expiredCategoryBundleWithdrawalKeepsRetryAtLargeText() = expiredBundleWithdrawal("parity")

    @Test fun expiredIabBundleWithdrawalKeepsRetryAtLargeText() = expiredBundleWithdrawal("iab")

    private fun expiredBundleWithdrawal(name: String) {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            RuntimeEnvironment.setFontScale(2f)
            val source = Json.parseToJsonElement(generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
                .map { File(it, "packages/native-protocol/bundled-policy/$name.json") }.first { it.exists() }.readText()).jsonObject
            val clock = AtomicLong(source.getValue("now").jsonPrimitive.long)
            val configuration = source["configuration"]?.let { Json { ignoreUnknownKeys = true }.decodeFromJsonElement<IabConfiguration>(it) }
            val config = NativeConfig(source.getValue("endpoint").jsonPrimitive.content,
                bundledPolicy = source.getValue("resource").toString(), iab = configuration, consentCategories = ConsentCategory.entries)
            val store = DecisionStore()
            val core = ConsentCore(config, InthStore(store), clock = Clock { clock.get() }, executor = TaskExecutor.DIRECT)
            core.bootstrap()
            assertTrue(core.save(CommitIntent.All).ok)
            val payload = Json.parseToJsonElement(source.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
            clock.set(payload.getValue("expiresAt").jsonPrimitive.long + 1)
            val presenter = ConsentPresenter(core, autoPresent = false)
            presenter.presentPreferences()
            assertFalse(presenter.snapshot.policyPending)
            assertTrue(core.isPolicyStale)
            compose.setContent {
                InthConsent(presenter, "https://app.test/privacy")
            }
            val prefix = if (presenter.iab) "inth.iab" else "inth.prefs"
            compose.onNodeWithTag("$prefix.reject-all").assertIsDisplayed()
            store.refuseNext = true
            compose.onNodeWithTag("$prefix.reject-all").performClick()
            compose.waitUntil(5_000) { presenter.errorMessage != null }
            compose.onNodeWithTag("inth.prefs.error.retry").assertIsDisplayed().performClick()
            compose.waitUntil(5_000) { presenter.presentationID == null }
            assertFalse(core.snapshot().policyPending)
            ConsentCategory.OPTIONAL.forEach { assertFalse(core.snapshot().explicitChoice!!.valueOf(it)!!) }
        } finally { RuntimeEnvironment.setFontScale(1f); Dispatchers.resetMain() }
    }

    @Test fun providerTagNamesTheBrandOnceAndSwapsItsLogo() {
        val provider = mutableStateOf<ConsentTheme.Branding>(ConsentTheme.Branding.C15t)
        compose.setContent {
            CompositionLocalProvider(LocalConsentTheme provides ConsentTheme(branding = provider.value)) {
                ProviderBranding("Secured by")
            }
        }
        for (branding in listOf(ConsentTheme.Branding.C15t, ConsentTheme.Branding.Inth,
            ConsentTheme.Branding.Custom("Example", android.R.drawable.ic_dialog_info))) {
            compose.runOnIdle { provider.value = branding }
            compose.onNodeWithTag("inth.first-layer.branding").assertContentDescriptionEquals("Secured by ${branding.name}")
            compose.onNodeWithTag("inth.first-layer.branding.logo", useUnmergedTree = true).assertIsDisplayed()
        }
        compose.runOnIdle { provider.value = ConsentTheme.Branding.Custom("Example") }
        compose.onNodeWithTag("inth.first-layer.branding").assertContentDescriptionEquals("Secured by Example")
        compose.onNodeWithTag("inth.first-layer.branding.logo", useUnmergedTree = true).assertDoesNotExist()
    }

    /** Inth's tag draws the horizontal wordmark, which is its name; the other providers keep a square mark. */
    @Test fun inthProviderTagShowsItsWordmark() {
        val provider = mutableStateOf<ConsentTheme.Branding>(ConsentTheme.Branding.Inth)
        compose.setContent {
            CompositionLocalProvider(LocalConsentTheme provides ConsentTheme(branding = provider.value)) {
                ProviderBranding("Secured by")
            }
        }
        fun logo() = compose.onNodeWithTag("inth.first-layer.branding.logo", useUnmergedTree = true).fetchSemanticsNode().size
        compose.onNodeWithTag("inth.first-layer.branding").assertContentDescriptionEquals("Secured by Inth")
        assertTrue("wordmark was ${logo()}", logo().width > 2 * logo().height)
        compose.runOnIdle { provider.value = ConsentTheme.Branding.C15t }
        assertEquals(logo().width, logo().height)
    }

    // TCF-CHECK: P10
    @Test fun sheetShowsTheSameChoicesOnACardAndOpensFullScreenSettings() = assertCard(ConsentTheme.FirstLayer.Sheet, "inth.first-layer.sheet")

    // TCF-CHECK: P10
    @Test fun promptShowsTheSameChoicesOnACardAndOpensFullScreenSettings() = assertCard(ConsentTheme.FirstLayer.Prompt, "inth.first-layer.prompt")

    private fun assertCard(layout: ConsentTheme.FirstLayer, tag: String) {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val presenter = show(DecisionStore(), ConsentTheme(firstLayer = layout))
            val card = compose.onNodeWithTag(tag).assertIsDisplayed().fetchSemanticsNode()
            val window = generateSequence(card) { it.parent }.last().size
            assertTrue("card was ${card.size} in $window", card.size.height < window.height && card.size.width < window.width)
            for (id in listOf("title", "body", "customize", "branding")) compose.onNodeWithTag("inth.first-layer.$id").assertIsDisplayed()
            // The sheet names the app in one row; the prompt, like a system dialog, has no identity.
            if (layout == ConsentTheme.FirstLayer.Sheet) compose.onNodeWithTag("inth.first-layer.brand").assertIsDisplayed()
            else compose.onNodeWithTag("inth.first-layer.brand").assertDoesNotExist()
            val reject = compose.onNodeWithTag("inth.first-layer.reject-all").assertIsDisplayed().fetchSemanticsNode().size
            assertEquals(reject, compose.onNodeWithTag("inth.first-layer.accept-all").assertIsDisplayed().fetchSemanticsNode().size)
            compose.onNodeWithTag("inth.first-layer.customize").performClick()
            compose.waitForIdle()
            compose.onNodeWithTag("inth.prefs.title").assertIsDisplayed()
            compose.onNodeWithTag(tag).assertDoesNotExist()
            // Back returns to the card.
            compose.runOnIdle { presenter.requestClose() }
            compose.waitForIdle()
            compose.onNodeWithTag(tag).assertIsDisplayed()
        } finally { Dispatchers.resetMain() }
    }

    // TCF-CHECK: P1
    @Test fun largeTextShowsASheetThemeAsThePage() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            RuntimeEnvironment.setFontScale(2f)
            show(DecisionStore(), ConsentTheme(firstLayer = ConsentTheme.FirstLayer.Sheet))
            compose.onNodeWithTag("inth.first-layer.sheet").assertDoesNotExist()
            compose.onNodeWithTag("inth.first-layer.brand").assertExists()
            compose.onNodeWithTag("inth.first-layer.accept-all").assertExists()
        } finally { RuntimeEnvironment.setFontScale(1f); Dispatchers.resetMain() }
    }

    /** Category mode speaks the policy's language, from `@inth/sdk-translations`, not English literals. */
    @Test fun categoryLabelsFollowThePolicyLanguage() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val german = ConsentCopy.forLanguage("de")
            val english = ConsentCopy.forLanguage("en")
            assertNotEquals(english.acceptAll, german.acceptAll)
            val presenter = show(DecisionStore(), language = "de")
            for ((id, label) in listOf("accept-all" to german.acceptAll, "reject-all" to german.rejectAll, "customize" to german.customize)) {
                compose.onNodeWithTag("inth.first-layer.$id").assertContentDescriptionEquals(label)
            }
            compose.onNodeWithTag("inth.first-layer.title").assertTextEquals(german.headline)
            compose.onNodeWithTag("inth.first-layer.body").assertTextEquals(german.introduction)
            compose.onNodeWithTag("inth.first-layer.branding").assertContentDescriptionEquals("${german.securedBy} Inth")
            compose.onNodeWithTag("inth.first-layer.brand").assertContentDescriptionEquals(german.brandPlaceholder)
            compose.runOnIdle { presenter.customize() }
            compose.waitForIdle()
            compose.onNodeWithTag("inth.prefs.save").assertContentDescriptionEquals(com.inth.consentui.generated.IabCopy.forLanguage("de").appSave)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun hidingBrandingHidesTheLogoAndNameTogether() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            show(DecisionStore(), ConsentTheme(showsBranding = false, branding = ConsentTheme.Branding.Inth))
            compose.onNodeWithTag("inth.first-layer.branding").assertDoesNotExist()
            compose.onNodeWithTag("inth.first-layer.branding.logo", useUnmergedTree = true).assertDoesNotExist()
        } finally { Dispatchers.resetMain() }
    }

    @Test fun lightOffSwitchContrastPasses() = assertOffSwitchContrast()

    @Test @Config(qualifiers = "night")
    fun darkOffSwitchContrastPasses() = assertOffSwitchContrast()

    private fun assertOffSwitchContrast() {
        lateinit var scheme: ColorScheme
        compose.setContent { scheme = ConsentTheme.default.colorScheme() }
        compose.waitForIdle()
        // Material 3's off thumb and track border use Outline; its off track uses
        // SurfaceContainerHighest. Card rows use SurfaceContainer.
        for (background in listOf(scheme.surfaceContainerHighest, scheme.surfaceContainer)) {
            val contrast = ColorUtils.calculateContrast(scheme.outline.toArgb(), background.toArgb())
            assertTrue("Off switch contrast was $contrast", contrast >= 3.0)
        }
    }

    private fun show(store: DecisionStore, theme: ConsentTheme = ConsentTheme.default, language: String? = null): ConsentPresenter {
        val fixture = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "examples/native/consent-demo/fixtures/category-init.json") }.first { it.exists() }.readText()
        val config = NativeConfig("https://fixture.invalid", overrides = KernelOverrides(language = language))
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, emptyMap(), fixture) else HttpResponse(503)
        }
        val core = ConsentCore(config, InthStore(store), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
        core.bootstrap()
        lateinit var presenter: ConsentPresenter
        compose.setContent {
            presenter = remember { ConsentPresenter(core) }
            InthConsent(presenter, "https://app.test/privacy", theme = theme)
        }
        compose.waitForIdle()
        return presenter
    }

    private class DecisionStore : KeyValueStore {
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        val release = CountDownLatch(1)
        @Volatile var block = false
        @Volatile var refuseNext = false
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean {
            if (key == "com.inth.snapshot") {
                if (block) check(release.await(10, TimeUnit.SECONDS))
                if (refuseNext) { refuseNext = false; return false }
            }
            write(key, value)
            return true
        }
    }
}
