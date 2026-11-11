package com.c15t.consentui

import android.os.Bundle
import android.os.Looper
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
import com.c15t.core.ConsentCore
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory
import com.c15t.core.spi.HttpClient
import com.c15t.core.spi.HttpRequest
import com.c15t.core.spi.HttpResponse
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.HostedTransport
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
class ConsentHostTest {
    class HostActivity : ComponentActivity() {
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            setContentView(FrameLayout(this))
        }
    }

    private val hosts = mutableListOf<ActivityController<out ComponentActivity>>()

    @After fun tearDown() {
        presenter()?.let { current ->
            await { !current.pending }
            current.discard()
        }
        hosts.asReversed().forEach { it.pause().stop().destroy() }
        shadowOf(Looper.getMainLooper()).idle()
    }

    @Test fun fallbackChoiceUsesModalHostAndReportsCommitted() {
        val core = boot("""{"policyResolution":{"version":1,"status":"no-match","policy":null}}""")
        assertFalse(core.snapshot().policyPending)
        assertTrue(core.snapshot().promptRequirement.notice)
        assertTrue(core.snapshot().promptRequirement.acknowledge)
        val host = host()
        val outcomes = mutableListOf<ConsentHostOutcome>()
        val request = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = outcomes::add))
        val modalIntent = shadowOf(host.get()).nextStartedActivity
        if (modalIntent != null) {
            hosts += Robolectric.buildActivity(ConsentHostActivity::class.java, modalIntent).setup().visible()
        }
        requireNotNull(presenter()).commit(ConsentPresenter.Action.REJECT)
        await { outcomes.isNotEmpty() }
        assertNotNull(core.snapshot().explicitChoice)
        assertTrue(outcomes.single() is ConsentHostOutcome.Committed)
        assertOutcome(request, outcomes.single(), core)
        assertNotNull("A fallback choice must open the modal host", modalIntent)
        assertEquals(0, noticeViews(host.get()))
    }

    @Test fun embeddedNoticeRestoresAfterRecreationWithoutAnotherPresentationRequest() {
        val core = boot(fixture("notice-init.json"))
        val host = host()
        val outcomes = mutableListOf<ConsentHostOutcome>()
        val request = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = outcomes::add))
        val current = requireNotNull(presenter())
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(1, noticeViews(host.get()))
        assertNull(shadowOf(host.get()).nextStartedActivity)

        val unrelated = host()
        assertEquals("An unrelated Activity must not acquire the notice", 0, noticeViews(unrelated.get()))
        assertEquals(1, noticeViews(host.get()))

        repeat(2) {
            val previous = host.get()
            host.recreate()
            shadowOf(Looper.getMainLooper()).idle()
            assertEquals("The notice must restore without a JS presentation request", 1, noticeViews(host.get()))
            assertEquals(0, noticeViews(previous))
            assertTrue(core.snapshot().promptRequirement.notice)
            assertTrue(outcomes.isEmpty())
        }

        current.commit(ConsentPresenter.Action.ACKNOWLEDGE)
        await { outcomes.isNotEmpty() }
        assertTrue(outcomes.single() is ConsentHostOutcome.Acknowledged)
        assertOutcome(request, outcomes.single(), core)
        assertNull(core.snapshot().explicitChoice)
        assertFalse(core.snapshot().promptRequirement.notice)
        assertEquals(0, noticeViews(host.get()))
        host.recreate()
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("A completed session must not return on recreation", 0, noticeViews(host.get()))
        assertEquals(1, outcomes.size)
    }

    /**
     * A notice cleared outside the host (`dismissNotice()`) leaves its session showing nothing. The
     * host ends it with an outcome, so a later request opens what was asked for, not `already-presented`.
     */
    @Test fun aNoticeClearedOutsideEndsItsSessionAndPreferencesOpen() {
        val core = boot(fixture("notice-init.json"))
        val host = host()
        val outcomes = mutableListOf<ConsentHostOutcome>()
        val first = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = outcomes::add))
        assertEquals(ConsentHostPresentation.PROMPT, first.presentation)
        assertTrue(requireNotNull(presenter()).noticeVisible)
        assertTrue(core.dismissNotice())
        await { outcomes.isNotEmpty() }
        assertTrue(outcomes.single() is ConsentHostOutcome.Dismissed)
        assertEquals(first.sessionId, outcomes.single().sessionId)

        val settings = opened(ConsentHost.present(host.get(), core, true, PRIVACY_URL, outcome = {}))
        assertEquals(ConsentHostPresentation.PREFERENCES, settings.presentation)
        assertNotNull(requireNotNull(presenter()).presentationID)
    }

    /** A notice owed again after its session ended opens a new session that shows it. */
    @Test fun aNoticeOwedAgainOpensANewSession() {
        val core = boot(fixture("notice-init.json"))
        val host = host()
        val outcomes = mutableListOf<ConsentHostOutcome>()
        val first = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = outcomes::add))
        assertTrue(core.dismissNotice())
        await { outcomes.isNotEmpty() }
        core.reset()
        val again = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = {}))
        assertNotEquals(first.sessionId, again.sessionId)
        assertTrue(requireNotNull(presenter()).noticeVisible)
    }

    /** A prompt request that meets open settings names them, so JavaScript waits for them to close. */
    @Test fun aPromptRequestOverOpenSettingsNamesThem() {
        val core = boot(fixture("category-init.json"))
        val host = host()
        val settings = opened(ConsentHost.present(host.get(), core, true, PRIVACY_URL, outcome = {}))
        val prompt = ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = {})
        assertEquals(ConsentHostSession.AlreadyPresented(settings.sessionId, ConsentHostPresentation.PREFERENCES), prompt)
    }

    @Test fun savedStateFromClosedNoticeCannotAttachANewerSession() {
        val core = boot(fixture("notice-init.json"))
        val host = host()
        val firstOutcomes = mutableListOf<ConsentHostOutcome>()
        val first = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = firstOutcomes::add))
        val oldState = Bundle()
        host.saveInstanceState(oldState)
        ConsentHost.close(first.sessionId)
        assertTrue(firstOutcomes.single() is ConsentHostOutcome.Dismissed)

        val nextOutcomes = mutableListOf<ConsentHostOutcome>()
        val next = opened(ConsentHost.present(host.get(), core, false, PRIVACY_URL, outcome = nextOutcomes::add))
        assertNotEquals(first.sessionId, next.sessionId)
        val restored = Robolectric.buildActivity(HostActivity::class.java).create(oldState).start().resume().visible()
        hosts += restored
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(0, noticeViews(restored.get()))
        assertEquals(1, noticeViews(host.get()))
        ConsentHost.close(first.sessionId)
        assertTrue(nextOutcomes.isEmpty())
        ConsentHost.close(next.sessionId)
        assertTrue(nextOutcomes.single() is ConsentHostOutcome.Dismissed)
        assertEquals(0, noticeViews(host.get()))
    }

    @Test fun modalRecreationRetainsDirtyDraftAndOneCompactOutcome() {
        val core = boot(fixture("category-init.json"))
        val host = host()
        val outcomes = mutableListOf<ConsentHostOutcome>()
        val request = opened(ConsentHost.present(host.get(), core, true, PRIVACY_URL, outcome = outcomes::add))
        val current = requireNotNull(presenter())
        current.setCategory(ConsentCategory.MEASUREMENT, true)
        val modal = Robolectric.buildActivity(ConsentHostActivity::class.java, shadowOf(host.get()).nextStartedActivity).setup().visible()
        hosts += modal
        modal.recreate()
        assertEquals(true, requireNotNull(presenter()).categories[ConsentCategory.MEASUREMENT])
        ConsentHost.close("obsolete-session")
        current.commit(ConsentPresenter.Action.SAVE)
        ConsentHost.close(request.sessionId)
        await { outcomes.isNotEmpty() }
        assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
        assertTrue(outcomes.single() is ConsentHostOutcome.Committed)
        assertOutcome(request, outcomes.single(), core)
        ConsentHost.close(request.sessionId)
        assertEquals(1, outcomes.size)
    }

    /**
     * Property (b): a manual prompt or settings request either shows something or says why not,
     * never `already-presented` over a session that shows nothing. Random sequences of requests,
     * external dismissals through the core, resets, saves, closes and decisions.
     */
    @Test fun aRequestIsNeverAnsweredWithASessionThatShowsNothing() {
        for (fixture in listOf("notice-init.json", "category-init.json")) for (seed in 1..40) hostSequence(seed, fixture)
    }

    private fun hostSequence(seed: Int, name: String) {
        val random = java.util.Random(seed.toLong())
        val core = boot(fixture(name))
        val host = host()
        var sessionId: String? = null
        val trace = mutableListOf<String>()
        fun showing(p: ConsentPresenter?) = p != null && (p.presentationID != null || p.noticeVisible || p.pending)
        repeat(40) {
            val action = listOf("prompt", "preferences", "dismiss-notice", "reset", "saved", "close", "acknowledge", "accept", "idle")
                .let { it[random.nextInt(it.size)] }
            trace += action
            when (action) {
                "prompt", "preferences" -> {
                    val preferences = action == "preferences"
                    val answer = ConsentHost.present(host.get(), core, preferences, PRIVACY_URL, outcome = {})
                    val context = "seed $seed ($name): $answer after ${trace.joinToString()}"
                    when (answer) {
                        is ConsentHostSession.Presented -> {
                            assertTrue("$context shows nothing", showing(presenter()))
                            sessionId = answer.sessionId
                        }
                        is ConsentHostSession.AlreadyPresented -> {
                            assertTrue("$context shows nothing", showing(presenter()))
                            sessionId = answer.sessionId
                        }
                        ConsentHostSession.NotRequired -> {
                            val s = core.snapshot()
                            assertFalse("$context for settings", preferences)
                            assertTrue("$context while a prompt is owed", s.policyPending || !s.promptRequirement.acknowledge && !s.promptRequirement.notice)
                        }
                    }
                }
                "dismiss-notice" -> core.dismissNotice()
                "reset" -> core.reset()
                "saved" -> core.save(com.c15t.core.CommitIntent.All)
                "close" -> sessionId?.let { ConsentHost.close(it) }
                "acknowledge" -> presenter()?.takeIf { it.noticeVisible && !it.pending }?.let { it.commit(ConsentPresenter.Action.ACKNOWLEDGE); await { !it.pending } }
                "accept" -> presenter()?.takeIf { it.presentationID != null && !it.pending }?.let { it.commit(ConsentPresenter.Action.ACCEPT); await { !it.pending } }
            }
            shadowOf(Looper.getMainLooper()).idle()
        }
        presenter()?.let { await { !it.pending }; it.discard() }
        shadowOf(Looper.getMainLooper()).idle()
        assertNull("seed $seed ($name): a session outlived the sequence", presenter())
    }

    private fun host() = Robolectric.buildActivity(HostActivity::class.java).setup().visible().also { hosts += it }

    private fun noticeViews(activity: ComponentActivity): Int {
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        return (0 until content.childCount).count { content.getChildAt(it) is ComposeView }
    }

    // Invoke production presenter actions while testing the actual host's final event closure.
    private fun presenter(): ConsentPresenter? {
        val field = ConsentHost::class.java.getDeclaredField("held").apply { isAccessible = true }
        val session = field.get(ConsentHost) ?: return null
        return (session.javaClass.getDeclaredField("prompt").apply { isAccessible = true }.get(session) as ConsentPrompt).presenter
    }

    private fun opened(session: ConsentHostSession): ConsentHostSession.Presented {
        assertTrue("Expected a new session, got $session", session is ConsentHostSession.Presented)
        return session as ConsentHostSession.Presented
    }

    private fun assertOutcome(request: ConsentHostSession.Presented, outcome: ConsentHostOutcome, core: ConsentCore) {
        assertEquals(request.sessionId, outcome.sessionId)
        assertEquals(core.snapshot().revision, outcome.revision)
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) {
            Thread.sleep(10)
            shadowOf(Looper.getMainLooper()).idle()
        }
        assertTrue("Native action did not finish", condition())
    }

    private fun fixture(name: String) = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
        .map { File(it, "native/examples/consent-demo/fixtures/$name") }.first { it.exists() }.readText()

    private fun boot(body: String): ConsentCore {
        val config = NativeConfig("https://fixture.invalid")
        val store = object : KeyValueStore {
            private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
            override fun read(key: String) = values[key]
            override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
            override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
        }
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), body) else HttpResponse(503)
        }
        return ConsentCore(config, C15tStore(store), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT).also { it.bootstrap() }
    }

    companion object { private const val PRIVACY_URL = "https://app.test/privacy" }
}
