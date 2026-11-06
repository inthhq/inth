package com.c15t.consentui

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.remember
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.core.graphics.ColorUtils
import com.c15t.core.C15tKernel
import com.c15t.core.CommitIntent
import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.model.ConsentCategory
import com.c15t.core.spi.*
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.HostedTransport
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
            for ((id, name) in listOf("accept-all" to "Accept all", "reject-all" to "Reject all")) {
                val semantics = compose.onNodeWithTag("c15t.first-layer.$id").fetchSemanticsNode().config
                assertEquals(listOf(name), semantics.getOrNull(SemanticsProperties.ContentDescription))
                assertEquals(if (id == "accept-all") "Saving choices" else null, semantics.getOrNull(SemanticsProperties.StateDescription))
                assertTrue(semantics.contains(SemanticsProperties.Disabled))
            }
            val spinners = compose.onAllNodesWithTag("c15t.status.progress", useUnmergedTree = true).fetchSemanticsNodes()
            assertEquals(1, spinners.size)
            val accept = compose.onNodeWithTag("c15t.first-layer.accept-all").fetchSemanticsNode().boundsInRoot
            assertTrue(spinners.single().boundsInRoot.left >= accept.left && spinners.single().boundsInRoot.right <= accept.right)
        } finally {
            store.release.countDown()
            try { compose.waitUntil(5_000) { presenter?.pending != true } }
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
        val colors = ConsentTheme.Colors.c15t
        fun argb(color: ConsentThemeColor) = (if (dark) color.dark else color.light) or 0xFF000000.toInt()
        val tagFill = ColorUtils.compositeColors(ColorUtils.setAlphaComponent(argb(colors.accent), Math.round(255 * 0.14f)), argb(colors.surface))
        val pairs = listOf(
            Triple("status tag text on its tint", argb(colors.statusTagText), tagFill) to 4.5,
            Triple("off tag text on muted surface", argb(colors.textSecondary), argb(colors.surfaceMuted)) to 4.5,
            Triple("summary text on muted surface", argb(colors.text), argb(colors.surfaceMuted)) to 4.5,
            Triple("section label on muted surface", argb(colors.textSecondary), argb(colors.surfaceMuted)) to 4.5,
            Triple("links on canvas", argb(colors.accent), argb(colors.canvas)) to 4.5,
            Triple("links on surface", argb(colors.accent), argb(colors.surface)) to 4.5,
            Triple("decision label", argb(colors.onDecision), argb(colors.decision)) to ConsentTheme.DECISION_CONTRAST_FLOOR,
            Triple("save label", argb(colors.onAccent), argb(colors.accent)) to 4.5,
        )
        for ((pair, floor) in pairs) {
            val (name, foreground, background) = pair
            val ratio = ColorUtils.calculateContrast(foreground, background)
            assertTrue("$name (${if (dark) "dark" else "light"}) was $ratio, needs $floor", ratio >= floor)
        }
    }

    @Test fun squareThemeCanShowAWriteRefusal() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            val store = DecisionStore()
            val presenter = show(store, ConsentTheme(cornerRadius = 0.dp))
            store.refuseNext = true
            compose.runOnIdle { presenter.commit(ConsentPresenter.Action.REJECT) }
            compose.waitUntil(5_000) { presenter.errorMessage != null }
            compose.onNodeWithTag("c15t.first-layer.error").assertIsDisplayed()
            compose.onNodeWithTag("c15t.first-layer.error.retry").assertIsDisplayed()
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
                .map { File(it, "native/protocol/bundled-policy/$name.json") }.first { it.exists() }.readText()).jsonObject
            val clock = AtomicLong(source.getValue("now").jsonPrimitive.long)
            val configuration = source["configuration"]?.let { Json { ignoreUnknownKeys = true }.decodeFromJsonElement<IabConfiguration>(it) }
            val config = NativeConfig(source.getValue("endpoint").jsonPrimitive.content,
                bundledPolicy = source.getValue("resource").toString(), iab = configuration, consentCategories = ConsentCategory.entries)
            val store = DecisionStore()
            val core = C15tKernel(config, C15tStore(store), clock = Clock { clock.get() }, executor = TaskExecutor.DIRECT)
            core.bootstrap()
            assertTrue(core.save(CommitIntent.All).ok)
            val payload = Json.parseToJsonElement(source.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
            clock.set(payload.getValue("expiresAt").jsonPrimitive.long + 1)
            val presenter = ConsentPresenter(core, automaticPresentation = false)
            presenter.presentPreferences()
            assertTrue(presenter.snapshot.policyPending)
            compose.setContent {
                C15tConsent(presenter, "https://app.test/privacy")
            }
            val prefix = if (presenter.iab) "c15t.iab" else "c15t.prefs"
            compose.onNodeWithTag("$prefix.reject-all").assertIsDisplayed()
            store.refuseNext = true
            compose.onNodeWithTag("$prefix.reject-all").performClick()
            compose.waitUntil(5_000) { presenter.errorMessage != null }
            compose.onNodeWithTag("c15t.prefs.error.retry").assertIsDisplayed().performClick()
            compose.waitUntil(5_000) { presenter.presentationID == null }
            assertTrue(core.snapshot().policyPending)
            ConsentCategory.OPTIONAL.forEach { assertFalse(core.snapshot().explicitChoice!!.valueOf(it)!!) }
        } finally { RuntimeEnvironment.setFontScale(1f); Dispatchers.resetMain() }
    }

    @Test fun providerTagNamesTheBrandOnceAndSwapsItsLogo() {
        val provider = mutableStateOf<ConsentTheme.Branding>(ConsentTheme.Branding.C15t)
        compose.setContent {
            CompositionLocalProvider(LocalConsentTheme provides ConsentTheme(branding = provider.value)) {
                ProviderBranding()
            }
        }
        for (branding in listOf(ConsentTheme.Branding.C15t, ConsentTheme.Branding.Inth,
            ConsentTheme.Branding.Custom("Example", android.R.drawable.ic_dialog_info))) {
            compose.runOnIdle { provider.value = branding }
            compose.onNodeWithTag("c15t.first-layer.branding").assertContentDescriptionEquals("Secured by ${branding.name}")
            compose.onNodeWithTag("c15t.first-layer.branding.logo", useUnmergedTree = true).assertIsDisplayed()
        }
        compose.runOnIdle { provider.value = ConsentTheme.Branding.Custom("Example") }
        compose.onNodeWithTag("c15t.first-layer.branding").assertContentDescriptionEquals("Secured by Example")
        compose.onNodeWithTag("c15t.first-layer.branding.logo", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test fun hidingBrandingHidesTheLogoAndNameTogether() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        try {
            show(DecisionStore(), ConsentTheme(showsBranding = false, branding = ConsentTheme.Branding.Inth))
            compose.onNodeWithTag("c15t.first-layer.branding").assertDoesNotExist()
            compose.onNodeWithTag("c15t.first-layer.branding.logo", useUnmergedTree = true).assertDoesNotExist()
        } finally { Dispatchers.resetMain() }
    }

    @Test fun lightOffSwitchContrastPasses() = assertOffSwitchContrast()

    @Test @Config(qualifiers = "night")
    fun darkOffSwitchContrastPasses() = assertOffSwitchContrast()

    private fun assertOffSwitchContrast() {
        lateinit var scheme: ColorScheme
        compose.setContent { scheme = ConsentTheme.c15t.colorScheme() }
        compose.waitForIdle()
        // Material 3's off thumb and track border use Outline; its off track uses
        // SurfaceContainerHighest. Card rows use SurfaceContainer.
        for (background in listOf(scheme.surfaceContainerHighest, scheme.surfaceContainer)) {
            val contrast = ColorUtils.calculateContrast(scheme.outline.toArgb(), background.toArgb())
            assertTrue("Off switch contrast was $contrast", contrast >= 3.0)
        }
    }

    private fun show(store: DecisionStore, theme: ConsentTheme = ConsentTheme.c15t): ConsentPresenter {
        val fixture = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "native/examples/consent-demo/fixtures/category-init.json") }.first { it.exists() }.readText()
        val config = NativeConfig("https://fixture.invalid")
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), fixture) else HttpResponse(503)
        }
        val core = C15tKernel(config, C15tStore(store), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
        core.bootstrap()
        lateinit var presenter: ConsentPresenter
        compose.setContent {
            presenter = remember { ConsentPresenter(core) }
            C15tConsent(presenter, "https://app.test/privacy", theme = theme)
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
            if (key == "com.c15t.snapshot") {
                if (block) check(release.await(10, TimeUnit.SECONDS))
                if (refuseNext) { refuseNext = false; return false }
            }
            write(key, value)
            return true
        }
    }
}
