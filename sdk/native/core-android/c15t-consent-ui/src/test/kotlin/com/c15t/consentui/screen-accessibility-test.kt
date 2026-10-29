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
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.core.graphics.ColorUtils
import com.c15t.core.C15tKernel
import com.c15t.core.NativeConfig
import com.c15t.core.spi.*
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.HostedTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

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
            for ((id, name) in listOf("accept-all" to "Accept all", "reject-all" to "Reject all")) {
                val semantics = compose.onNodeWithTag("c15t.first-layer.$id").fetchSemanticsNode().config
                assertEquals(listOf(name), semantics.getOrNull(SemanticsProperties.ContentDescription))
                assertEquals("Saving choices", semantics.getOrNull(SemanticsProperties.StateDescription))
                assertTrue(semantics.contains(SemanticsProperties.Disabled))
            }
        } finally {
            store.release.countDown()
            try { compose.waitUntil(5_000) { presenter?.pending != true } }
            finally { Dispatchers.resetMain() }
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
            assertNotNull(presenter.presentationID)
        } finally { Dispatchers.resetMain() }
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
