package com.c15t.consentui.headless

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.activity.ComponentActivity
import com.c15t.core.CommitIntent
import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory
import com.c15t.core.spi.KeyValueStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** The composable blocks: when they show content, and the accessibility they add. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@OptIn(ExperimentalCoroutinesApi::class)
class HeadlessComponentsTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Before fun main() = Dispatchers.setMain(Dispatchers.Unconfined)
    @After fun reset() = Dispatchers.resetMain()

    @Test fun theGateFollowsTheCommittedPermission() {
        val core = core("category-init.json")
        compose.setContent {
            ConsentGate(ConsentCategory.MEASUREMENT, core, fallback = { BasicText("off", Modifier.testTag("fallback")) }) {
                BasicText("on", Modifier.testTag("gated"))
            }
        }
        compose.onNodeWithTag("fallback").assertExists()
        compose.onNodeWithTag("gated").assertDoesNotExist()
        assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasTestTag("gated")).fetchSemanticsNodes().isNotEmpty() }
        assertTrue(core.save(CommitIntent.Necessary).ok)
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasTestTag("fallback")).fetchSemanticsNodes().isNotEmpty() }
    }

    /** A predicate that reads Compose state is checked again when that state changes, not only on a consent change. */
    @Test fun theGateFollowsStateItsPredicateReads() {
        val core = core("category-init.json")
        assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
        var selected by mutableStateOf(ConsentCategory.MEASUREMENT)
        val allowed: (ConsentCore) -> Boolean = { it.isAllowed(selected) }
        compose.setContent { ConsentGate(allowed, core) { BasicText("on", Modifier.testTag("gated")) } }
        compose.onNodeWithTag("gated").assertExists()
        compose.runOnIdle { selected = ConsentCategory.MARKETING }
        compose.onNodeWithTag("gated").assertDoesNotExist()
    }

    @Test fun thePromptShowsOnlyWhileOwedAndRejectAllSettlesIt() {
        val core = core("category-init.json")
        var opened = 0
        compose.setContent {
            val draft = rememberConsentDraft(core)
            HeadlessConsentPrompt(draft, onOpenPreferences = { opened++ }, fallback = { BasicText("idle", Modifier.testTag("idle")) }) {
                Column(Modifier.consentPane(title).testTag("prompt")) {
                    BasicText(title, Modifier.consentInitialFocus().testTag("title"))
                    BasicText(rejectAllLabel, Modifier.testTag("reject").clickable { rejectAll() })
                    BasicText(customizeLabel, Modifier.testTag("customize").clickable { openPreferences() })
                }
            }
        }
        compose.onNodeWithTag("title").assertIsFocused()
        assertNotNull(compose.onNodeWithTag("prompt").fetchSemanticsNode().config.getOrNull(SemanticsProperties.PaneTitle))
        compose.onNodeWithTag("customize").performClick()
        assertEquals(1, opened)
        compose.onNodeWithTag("reject").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasTestTag("idle")).fetchSemanticsNodes().isNotEmpty() }
        assertNotNull(core.snapshot().explicitChoice)
        assertFalse(core.isAllowed(ConsentCategory.MARKETING))
    }

    @Test fun backAsksBeforeDroppingUnsavedPreferences() {
        val core = core("category-init.json")
        var open by mutableStateOf(true)
        lateinit var scope: ConsentPreferencesScope
        compose.setContent {
            val draft = rememberConsentDraft(core)
            if (open) HeadlessConsentPreferences(draft, onClose = { open = false }) {
                scope = this
                BasicText(title, Modifier.testTag("preferences"))
            }
        }
        compose.runOnIdle { scope.categories.first { !it.locked }.onCheckedChange(true) }
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.runOnIdle {
            assertTrue(open)
            assertTrue(scope.confirmDiscard)
            scope.discard()
        }
        compose.onNodeWithTag("preferences").assertDoesNotExist()
        assertNull(core.snapshot().explicitChoice)
    }

    /** A save made inside an earlier observer delivers the newer snapshot first. The state must end on it. */
    @Test fun theSnapshotStateNeverStepsBack() {
        val core = core("category-init.json")
        var saved = false
        // Registered first, so it runs before the composable's observer and saves again mid-delivery.
        val earlier = core.onChange { if (!saved) { saved = true; core.save(CommitIntent.Necessary) } }
        lateinit var state: androidx.compose.runtime.State<com.c15t.core.model.ConsentSnapshot>
        compose.setContent { state = rememberConsentSnapshot(core) }
        compose.waitForIdle()
        assertTrue(core.save(CommitIntent.All).ok)
        compose.waitForIdle()
        earlier.close()
        assertTrue(saved)
        assertEquals(core.snapshot().revision, state.value.revision)
    }

    /** A prompt that becomes owed under open preferences must not take Back from them. */
    @Test fun backStaysWithOpenPreferencesWhenAPromptBecomesOwed() {
        val core = fixtureCore("iab-init.json", memory(), iab = true)
        assertTrue(core.save(CommitIntent.Necessary).ok)
        var open by mutableStateOf(true)
        lateinit var scope: ConsentPreferencesScope
        lateinit var shared: ConsentDraft
        compose.setContent {
            val draft = rememberConsentDraft(core)
            shared = draft
            if (open) HeadlessConsentPreferences(draft, onClose = { open = false }) { scope = this; BasicText(title, Modifier.testTag("preferences")) }
            HeadlessConsentPrompt(draft, onOpenPreferences = {}) { BasicText(title, Modifier.testTag("prompt")) }
        }
        compose.onNodeWithTag("prompt").assertDoesNotExist()
        // The saved choice goes away, so the IAB first layer is owed again, and its Back handler is the newest.
        core.reset()
        compose.waitUntil(5_000) { compose.onAllNodes(androidx.compose.ui.test.hasTestTag("prompt")).fetchSemanticsNodes().isNotEmpty() }
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.runOnIdle { assertFalse(open) }
        assertEquals(0, shared.openPreferences)
    }

    /** The blocks carry no look: nothing under `headless` may reach for Material. */
    @Test fun theBlocksDoNotImportMaterial() {
        val directory = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "native/core-android/c15t-consent-ui/src/main/kotlin/com/c15t/consentui/headless") }.first { it.exists() }
        val sources = directory.listFiles { file -> file.extension == "kt" }.orEmpty()
        assertTrue(sources.size >= 3)
        for (source in sources) assertFalse("${source.name} imports Material", source.readText().contains("androidx.compose.material"))
    }

    private fun core(fixture: String): ConsentCore = fixtureCore(fixture, memory())

    private fun memory() = object : KeyValueStore {
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
    }
}
