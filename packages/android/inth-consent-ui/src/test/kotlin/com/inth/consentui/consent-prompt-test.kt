package com.inth.consentui

import android.os.Bundle
import android.os.Looper
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.inth.core.CommitIntent
import com.inth.core.ConsentCore
import com.inth.core.NativeConfig
import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.HostedTransport
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import java.io.File

/** Auto-present through the shared prompt: what shows, when, and never twice at once. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@LooperMode(LooperMode.Mode.PAUSED)
class ConsentPromptTest {
    @get:Rule val compose = createComposeRule()

    @Test fun owedChoicePresentsOnceTheCoreIsReady() {
        val (core, _) = boot(fixture("category-init.json"))
        compose.setContent { InthConsent(URL, core = core) }
        compose.waitForIdle()
        firstLayers().assertCountEquals(1)
    }

    @Test fun optOutShowsNothingUntilTheAppAsks() {
        val (core, _) = boot(fixture("category-init.json"))
        compose.setContent { InthConsent(URL, autoPresent = false, core = core) }
        compose.waitForIdle()
        firstLayers().assertCountEquals(0)
        compose.runOnIdle { ConsentPrompt.of(core).presentPrompt() }
        compose.waitForIdle()
        firstLayers().assertCountEquals(1)
    }

    @Test fun optOutAlsoHoldsBackAnOwedNotice() {
        val (core, _) = boot(fixture("notice-init.json"))
        compose.setContent { InthConsent(URL, autoPresent = false, core = core) }
        compose.waitForIdle()
        compose.onAllNodesWithTag("inth.notice").assertCountEquals(0)
        compose.runOnIdle { ConsentPrompt.of(core).presentPrompt() }
        compose.waitForIdle()
        compose.onAllNodesWithTag("inth.notice").assertCountEquals(1)
    }

    @Test fun owedNoticeShowsByDefault() {
        val (core, _) = boot(fixture("notice-init.json"))
        compose.setContent { InthConsent(URL, core = core) }
        compose.waitForIdle()
        compose.onAllNodesWithTag("inth.notice").assertCountEquals(1)
        firstLayers().assertCountEquals(0)
    }

    @Test fun validStoredChoiceStaysQuiet() {
        val (core, _) = boot(fixture("category-init.json"))
        assertTrue(core.save(CommitIntent.All).ok)
        compose.setContent { InthConsent(URL, core = core) }
        compose.waitForIdle()
        firstLayers().assertCountEquals(0)
        assertNull(ConsentPrompt.of(core).presenter.presentationID)
    }

    @Test fun policyChangePromptsAgainAfterAnAnswer() {
        val (core, server) = boot(fixture("category-init.json"))
        compose.setContent { InthConsent(URL, core = core) }
        compose.waitForIdle()
        val presenter = ConsentPrompt.of(core).presenter
        compose.runOnIdle { presenter.commit(ConsentPresenter.Action.ACCEPT) }
        await { !presenter.pending && presenter.presentationID == null }
        firstLayers().assertCountEquals(0)

        server.body = server.body.replace("a".repeat(64), "d".repeat(64))
        core.refresh()
        await { presenter.presentationID != null }
        firstLayers().assertCountEquals(1)
        assertEquals("policy-changed", core.snapshot().promptRequirement.reason?.wireName)
    }

    @Test fun twoScreensAndAManualCallOpenOnePrompt() {
        val (core, _) = boot(fixture("category-init.json"))
        compose.setContent {
            InthConsent(URL, core = core)
            InthConsent(URL, core = core)
        }
        compose.waitForIdle()
        firstLayers().assertCountEquals(1)
        val prompt = ConsentPrompt.of(core)
        val session = prompt.presenter.presentationID
        assertNotNull(session)
        compose.runOnIdle { prompt.presentPrompt(); prompt.presentPreferences() }
        compose.waitForIdle()
        assertEquals(session, prompt.presenter.presentationID)
        firstLayers().assertCountEquals(1)
    }

    /** With no screen attached nothing presents by itself, so a screen that opted out finds nothing open. */
    @Test fun nothingPresentsWhileNoScreenIsAttached() {
        val (core, _) = boot(fixture("category-init.json"))
        assertTrue(core.save(CommitIntent.All).ok)
        var screen by mutableIntStateOf(0)
        compose.setContent {
            when (screen) {
                0 -> InthConsent(URL, core = core)
                2 -> InthConsent(URL, autoPresent = false, core = core)
            }
        }
        compose.waitForIdle()
        val prompt = ConsentPrompt.of(core)
        compose.runOnIdle { screen = 1 }
        compose.waitForIdle()

        core.reset()
        await { core.snapshot().promptRequirement.acknowledge }
        compose.waitForIdle()
        assertNull("nothing presents without a screen", prompt.presenter.presentationID)

        compose.runOnIdle { screen = 2 }
        compose.waitForIdle()
        assertNull("the opted-out screen finds nothing open", prompt.presenter.presentationID)
        firstLayers().assertCountEquals(0)
    }

    @Test fun dismissedPromptStaysClosedWhenAScreenComesBack() {
        val (core, _) = boot(fixture("category-init.json"))
        var generation by mutableIntStateOf(0)
        compose.setContent { key(generation) { InthConsent(URL, core = core) } }
        compose.waitForIdle()
        val prompt = ConsentPrompt.of(core)
        val outcomes = mutableListOf<ConsentPresenterOutcome>()
        prompt.onFinished = { outcomes += it }
        compose.runOnIdle { prompt.presenter.backFromFirstLayer() }
        compose.waitForIdle()
        assertEquals(listOf(ConsentPresenterOutcome.DISMISSED), outcomes)
        // A new screen attaching, as after Activity recreation, does not reopen the same prompt.
        compose.runOnIdle { generation += 1 }
        compose.waitForIdle()
        firstLayers().assertCountEquals(0)
        assertNull(prompt.presenter.presentationID)
    }

    @Test fun activityCallKeepsOneSessionAcrossRecreation() {
        val (core, _) = boot(fixture("category-init.json"))
        AttachingActivity.core = core
        val controller = Robolectric.buildActivity(AttachingActivity::class.java).setup().visible()
        shadowOf(Looper.getMainLooper()).idle()
        val presenter = ConsentPrompt.of(core).presenter
        val session = presenter.presentationID
        assertNotNull(session)
        controller.recreate()
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(session, presenter.presentationID)
        assertSame(presenter, controller.get().prompt?.presenter)
        controller.pause().stop().destroy()
        shadowOf(Looper.getMainLooper()).idle()
    }

    /** Once the notice is acknowledged, the view `attachConsent` added takes no space and no touches. */
    @Test fun theActivityNoticeLeavesNoTouchRegionBehind() {
        val (core, _) = boot(fixture("notice-init.json"))
        AttachingActivity.core = core
        val controller = Robolectric.buildActivity(AttachingActivity::class.java).setup().visible()
        shadowOf(Looper.getMainLooper()).idle()
        frames()
        val content = controller.get().findViewById<android.view.ViewGroup>(android.R.id.content)
        val overlay = content.getChildAt(content.childCount - 1)
        // Measure as the content frame does: full width, at most its height, wrap content.
        val measured = {
            overlay.measure(android.view.View.MeasureSpec.makeMeasureSpec(400, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(800, android.view.View.MeasureSpec.AT_MOST))
            overlay.measuredHeight
        }
        assertTrue("the notice is drawn", measured() > 0)

        ConsentPrompt.of(core).presenter.commit(ConsentPresenter.Action.ACKNOWLEDGE)
        await { !ConsentPrompt.of(core).presenter.pending }
        frames()
        assertFalse(ConsentPrompt.of(core).presenter.noticeVisible)
        assertEquals("nothing is left to swallow touches", 0, measured())
        controller.pause().stop().destroy()
        shadowOf(Looper.getMainLooper()).idle()
    }

    class AttachingActivity : ComponentActivity() {
        var prompt: ConsentPrompt? = null
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            setContentView(FrameLayout(this))
            prompt = attachConsent(URL, core = requireNotNull(core))
        }
        companion object { var core: ConsentCore? = null }
    }

    /** The commit resumes on the paused main looper, which `waitUntil` does not drain. */
    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) {
            Thread.sleep(10)
            shadowOf(Looper.getMainLooper()).idle()
        }
        assertTrue("Presenter did not settle", condition())
        compose.waitForIdle()
    }

    /** Run the frames a recomposition and its layout pass wait for. */
    private fun frames() = repeat(5) {
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(50))
        compose.waitForIdle()
    }

    private fun firstLayers() = compose.onAllNodesWithTag("inth.first-layer")

    private class Server(@Volatile var body: String) : HttpClient {
        override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
            HttpResponse(200, emptyMap(), body) else HttpResponse(503)
    }

    private fun fixture(name: String) = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
        .map { File(it, "examples/native/consent-demo/fixtures/$name") }.first { it.exists() }.readText()

    private fun boot(body: String): Pair<ConsentCore, Server> {
        val config = NativeConfig("https://fixture.invalid")
        val store = object : KeyValueStore {
            private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
            override fun read(key: String) = values[key]
            override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
            override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
        }
        val server = Server(body)
        val core = ConsentCore(config, InthStore(store), transport = HostedTransport(server, config), executor = TaskExecutor.DIRECT)
        core.bootstrap()
        return core to server
    }

    companion object { private const val URL = "https://app.test/privacy" }
}
