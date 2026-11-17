package com.c15t.consentui

import android.os.Bundle
import android.os.Looper
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import com.c15t.core.C15t
import com.c15t.core.CommitIntent
import com.c15t.core.ConsentCore
import com.c15t.core.NativeConfig
import com.c15t.core.spi.HttpClient
import com.c15t.core.spi.HttpRequest
import com.c15t.core.spi.HttpResponse
import com.c15t.core.spi.KeyValueStore
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.HostedTransport
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

/**
 * Auto-present for a runtime that draws the prompt through [ConsentHost], such as React Native.
 *
 * The native [ConsentPrompt] decides when a prompt is owed; JavaScript only hands over its
 * settings and hears what is on screen. These are the cases the React Native ledger used to
 * cover, asserted against the native host: what opens by itself, when, never twice, and never
 * for an app that opted out. Each rule here has a test that fails without it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
class ConsentHostAutoPresentTest {
    class HostActivity : ComponentActivity() {
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            setContentView(FrameLayout(this))
        }
    }

    /** What the host told the runtime, in order. */
    private class Events : ConsentHost.Listener {
        val log = mutableListOf<String>()
        val presented = mutableListOf<Triple<String, ConsentHostPresentation, Boolean>>()
        val outcomes = mutableListOf<ConsentHostOutcome>()
        var unavailable = 0
        override fun presented(sessionId: String, presentation: ConsentHostPresentation, automatic: Boolean) {
            log += "presented:$sessionId"
            presented += Triple(sessionId, presentation, automatic)
        }
        override fun unavailable(code: String, message: String) {
            assertEquals("C15T_PRESENTER_UNAVAILABLE", code)
            log += "unavailable"
            unavailable += 1
        }
        override fun outcome(outcome: ConsentHostOutcome) {
            log += "outcome:${outcome.sessionId}"
            outcomes += outcome
        }
        /** Sessions reported on screen whose outcome has not arrived. */
        val open get() = presented.map { it.first } - outcomes.map { it.sessionId }.toSet()
    }

    private val owner = Any()
    private val events = Events()
    private val hosts = mutableListOf<ActivityController<out ComponentActivity>>()

    @After fun tearDown() {
        ConsentHost.detach(owner)
        presenter()?.let { current ->
            await { !current.pending }
            current.discard()
        }
        hosts.asReversed().forEach { runCatching { it.pause().stop().destroy() } }
        idle()
        C15t.uninstall()
    }

    @Test fun anOwedPromptPresentsByItselfOnce() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = true)
        // Strict mode mounts, unmounts and mounts again: on, off, on.
        configure(core, host, autoPresent = false)
        configure(core, host, autoPresent = true)

        assertEquals(1, events.presented.size)
        val (_, presentation, automatic) = events.presented.single()
        assertEquals(ConsentHostPresentation.PROMPT, presentation)
        assertTrue(automatic)
        assertNotNull("the prompt is drawn in the modal host", shadowOf(host.get()).nextStartedActivity)
        assertNull(shadowOf(host.get()).nextStartedActivity)
    }

    @Test fun aValidStoredChoiceStaysQuiet() {
        val core = boot("category-init.json")
        core.save(CommitIntent.All)
        configure(core, host(), autoPresent = true)
        assertTrue(events.log.isEmpty())
    }

    @Test fun aDismissedPromptIsNotPresentedAgainForTheSameRequirement() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = true)
        ConsentHost.close(events.presented.single().first)
        assertTrue(events.outcomes.single() is ConsentHostOutcome.Dismissed)

        configure(core, host, autoPresent = false)
        configure(core, host, autoPresent = true)
        host.pause().resume()
        idle()
        assertEquals("a dismissed prompt stays closed", 1, events.presented.size)
        assertNull(core.snapshot().explicitChoice)
    }

    @Test fun theSameOwedPromptPresentsAgainAfterNothingWasOwed() {
        val core = boot("category-init.json")
        configure(core, host(), autoPresent = true)
        val first = events.presented.single().first
        requireNotNull(presenter()).commit(ConsentPresenter.Action.ACCEPT)
        await { events.outcomes.isNotEmpty() }
        assertTrue(events.outcomes.single() is ConsentHostOutcome.Committed)

        core.reset()
        await { events.presented.size == 2 }
        assertTrue("a new session", events.presented.last().first != first)
    }

    @Test fun anAppThatOptedOutSeesNothingUntilItAsks() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = false)
        host.pause().resume()
        idle()
        assertTrue(events.log.isEmpty())

        val outcomes = mutableListOf<ConsentHostOutcome>()
        val answer = ConsentHost.present(host.get(), core, false, PRIVACY_URL, owner = owner, outcome = outcomes::add)
        assertTrue(answer is ConsentHostSession.Presented)
        assertFalse("the app asked for it", events.presented.single().third)
    }

    /** Dismissing is a fact about the person, not the setting: it holds once auto-present turns on. */
    @Test fun aPromptTheAppOpenedAndThePersonDismissedStaysClosedWhenAutoPresentTurnsOn() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = false)
        val answer = ConsentHost.present(host.get(), core, false, PRIVACY_URL, owner = owner) {} as ConsentHostSession.Presented
        ConsentHost.close(answer.sessionId)
        configure(core, host, autoPresent = true)
        assertEquals("only the session the app opened", 1, events.presented.size)
    }

    @Test fun turningAutoPresentOnPresentsAnAlreadyOwedPrompt() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = false)
        assertTrue(events.presented.isEmpty())
        configure(core, host, autoPresent = true)
        assertEquals(1, events.presented.size)
    }

    /** No Activity yet, or the app in the background: the prompt waits for one, and is not lost. */
    @Test fun anOwedPromptWithNoActivityShowsOnceOneResumes() {
        val core = boot("category-init.json")
        val host = host()
        host.pause()
        configure(core, null, autoPresent = true)
        assertTrue(events.presented.isEmpty())
        assertEquals("reported once", 1, events.unavailable)
        configure(core, null, autoPresent = true)
        assertEquals(1, events.unavailable)

        host.resume()
        idle()
        assertEquals(1, events.presented.size)
        assertEquals(listOf("unavailable", "presented:${events.presented.single().first}"), events.log)
    }

    @Test fun aPromptOwedWhileInTheBackgroundShowsOnReturn() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = true)
        requireNotNull(presenter()).commit(ConsentPresenter.Action.ACCEPT)
        await { events.outcomes.isNotEmpty() }
        host.pause()
        core.reset()
        idle()
        assertEquals(1, events.presented.size)

        host.resume()
        idle()
        assertEquals(2, events.presented.size)
    }

    /** It opened by itself while no Activity could show it, then the app opted out: it never shows. */
    @Test fun optingOutWithdrawsAPromptThatNeverShowed() {
        val core = boot("category-init.json")
        val host = host()
        host.pause()
        configure(core, null, autoPresent = true)
        configure(core, null, autoPresent = false)
        host.resume()
        idle()
        assertTrue(events.presented.isEmpty())
        assertNull(ConsentPrompt.of(core).presenter.presentationID)
        assertNull("withdrawn, not dismissed: still owed", core.snapshot().explicitChoice)

        configure(core, host, autoPresent = true)
        assertEquals("still owed for a host that presents", 1, events.presented.size)
    }

    /**
     * Settings close while a prompt is owed: the prompt opens, and it is reported before the
     * settings' outcome, so a step waiting for c15t's screens to close never runs in between.
     */
    @Test fun aPromptThatOpensAsSettingsCloseIsReportedBeforeTheirOutcome() {
        val core = boot("category-init.json")
        core.save(CommitIntent.All)
        val host = host()
        configure(core, host, autoPresent = true)
        val settings = ConsentHost.present(host.get(), core, true, PRIVACY_URL, owner = owner, outcome = events::outcome) as ConsentHostSession.Presented
        core.reset()
        idle()
        assertEquals("settings stay up", listOf(settings.sessionId), events.open)

        ConsentHost.close(settings.sessionId)
        val prompt = events.presented.last()
        assertEquals(ConsentHostPresentation.PROMPT, prompt.second)
        assertEquals(listOf("presented:${settings.sessionId}", "presented:${prompt.first}", "outcome:${settings.sessionId}"), events.log)
    }

    /**
     * As on a device: the full-screen settings Activity pauses the app's Activity under it, and
     * closing it only asks it to finish. The app's Activity resumes after that, so the prompt that
     * follows can only show then. The settings' outcome waits for it.
     */
    @Test fun onADeviceThePromptThatFollowsSettingsIsReportedBeforeTheirOutcome() {
        val (core, host, settings) = settingsOverAPausedApp()
        ConsentHost.close(settings)
        idle()
        assertEquals("held until the prompt that follows is on screen", listOf("presented:$settings"), events.log)

        host.resume()
        idle()
        val prompt = events.presented.last()
        assertEquals(ConsentHostPresentation.PROMPT, prompt.second)
        assertEquals(listOf("presented:$settings", "presented:${prompt.first}", "outcome:$settings"), events.log)
        assertNull(core.snapshot().explicitChoice)
    }

    /** The app goes to the background instead and never comes back: the outcome is not held forever. */
    @Test fun aHeldOutcomeIsSentWhenNoActivityComesBack() {
        val (_, host, settings) = settingsOverAPausedApp()
        ConsentHost.close(settings)
        host.stop()
        shadowOf(Looper.getMainLooper()).idleFor(ConsentHost.replacementWaitMs + 100, TimeUnit.MILLISECONDS)
        assertEquals(listOf("presented:$settings", "outcome:$settings", "unavailable"), events.log)

        host.start().resume()
        idle()
        assertEquals("the owed prompt still shows on return", 2, events.presented.size)
    }

    /** No prompt will follow once the app opts out, so the outcome goes at once. */
    @Test fun aHeldOutcomeIsSentWhenTheAppOptsOut() {
        val (core, host, settings) = settingsOverAPausedApp()
        ConsentHost.close(settings)
        configure(core, null, autoPresent = false)
        assertEquals(listOf("presented:$settings", "outcome:$settings"), events.log)
        host.resume()
        idle()
        assertEquals(1, events.presented.size)
    }

    /** Settings the app opened, over an Activity paused by them, with a prompt owed behind them. */
    private fun settingsOverAPausedApp(): Triple<ConsentCore, ActivityController<HostActivity>, String> {
        val core = boot("category-init.json")
        core.save(CommitIntent.All)
        val host = host()
        configure(core, host, autoPresent = true)
        val settings = ConsentHost.present(host.get(), core, true, PRIVACY_URL, owner = owner, outcome = events::outcome) as ConsentHostSession.Presented
        hosts += Robolectric.buildActivity(ConsentHostActivity::class.java, shadowOf(host.get()).nextStartedActivity).setup().visible()
        host.pause()
        core.reset()
        idle()
        assertEquals(listOf("presented:${settings.sessionId}"), events.log)
        return Triple(core, host, settings.sessionId)
    }

    @Test fun rotationKeepsOneSession() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = true)
        val modal = Robolectric.buildActivity(ConsentHostActivity::class.java, shadowOf(host.get()).nextStartedActivity).setup().visible()
        hosts += modal
        modal.recreate()
        host.recreate()
        idle()
        configure(core, host, autoPresent = true)
        assertEquals(1, events.presented.size)
        assertTrue(events.outcomes.isEmpty())
    }

    /** React Native reloads while the prompt is up: the new runtime hears it is on screen. */
    @Test fun aNewRuntimeHearsOfTheSessionOnScreen() {
        val core = boot("category-init.json")
        val host = host()
        configure(core, host, autoPresent = true)
        val open = events.presented.single().first
        ConsentHost.detach(owner)

        val reloaded = Any()
        val heard = Events()
        ConsentHost.configure(host.get().application, host.get(), core, true, PRIVACY_URL, reloaded, heard)
        assertEquals(listOf(open), heard.open)
        ConsentHost.detach(reloaded)
    }

    @Test fun anOwedPromptIsNotLostAcrossUninstall() {
        val store = MemoryStore()
        val first = install(store)
        val host = host()
        configure(first, host, autoPresent = true)
        val before = events.presented.single().first

        C15t.uninstall()
        assertTrue("the session of the dropped core ends", events.outcomes.single() is ConsentHostOutcome.Unavailable)
        val second = install(store)
        // The binding follows the installed core on its next call; a resumed Activity does too.
        ConsentHost.follow(second)
        idle()
        assertEquals(2, events.presented.size)
        assertTrue(events.presented.last().first != before)
        assertEquals(listOf(events.presented.last().first), events.open)
    }

    @Test fun aResumedActivityFollowsANewInstall() {
        val store = MemoryStore()
        val host = host()
        configure(install(store), host, autoPresent = true)
        C15t.uninstall()
        install(store)
        host.pause().resume()
        idle()
        assertEquals(2, events.presented.size)
    }

    /**
     * Over random sequences, with auto-present on and an Activity in the foreground: native shows
     * something exactly when the host reports one session open. With the presenter's own property
     * (`AutoPresentTest`) that is the invariant: an owed prompt is never left unshown.
     */
    @Test fun whatIsReportedOpenIsWhatNativeShowsOverRandomSequences() {
        for (fixture in listOf("category-init.json", "notice-init.json")) for (seed in 1..25) sequence(seed, fixture)
    }

    private fun sequence(seed: Int, fixture: String) {
        val random = java.util.Random(seed.toLong())
        val core = boot(fixture)
        val host = host()
        val events = Events()
        var autoPresent = true
        // How many sessions had been reported when the app last opted out.
        var offAt: Int? = null
        ConsentHost.configure(host.get().application, host.get(), core, true, PRIVACY_URL, owner, events)
        val trace = mutableListOf<String>()
        repeat(30) {
            val action = listOf("reset", "accept", "acknowledge", "close", "preferences", "prompt", "off", "on", "background", "dismiss-notice")
                .let { it[random.nextInt(it.size)] }
            trace += action
            val presenter = ConsentPrompt.of(core).presenter
            when (action) {
                "reset" -> core.reset()
                "accept" -> if (presenter.presentationID != null && !presenter.pending) { presenter.commit(ConsentPresenter.Action.ACCEPT); await { !presenter.pending } }
                "acknowledge" -> if (presenter.noticeVisible && !presenter.pending) { presenter.commit(ConsentPresenter.Action.ACKNOWLEDGE); await { !presenter.pending } }
                "close" -> events.open.firstOrNull()?.let(ConsentHost::close)
                "preferences" -> ConsentHost.present(host.get(), core, true, PRIVACY_URL, owner = owner, outcome = events::outcome)
                "prompt" -> ConsentHost.present(host.get(), core, false, PRIVACY_URL, owner = owner, outcome = events::outcome)
                "off", "on" -> {
                    autoPresent = action == "on"
                    offAt = if (autoPresent) null else offAt ?: events.presented.size
                    ConsentHost.configure(host.get().application, host.get(), core, autoPresent, PRIVACY_URL, owner, events)
                }
                "background" -> host.pause().resume()
                "dismiss-notice" -> core.dismissNotice()
            }
            idle()
            val shows = presenter.presentationID != null || presenter.noticeVisible
            val context = "seed $seed ($fixture) after ${trace.joinToString()}: ${events.log}"
            assertTrue("$context: more than one session open", events.open.size <= 1)
            assertEquals("$context: native shows ${if (shows) "something" else "nothing"}", shows, events.open.size == 1)
            offAt?.let { assertTrue("$context: opened by itself after opting out", events.presented.drop(it).none { session -> session.third }) }
        }
        presenter()?.let { await { !it.pending }; it.discard() }
        idle()
        ConsentHost.detach(owner)
    }

    private fun configure(core: ConsentCore, host: ActivityController<HostActivity>?, autoPresent: Boolean) {
        val application = host?.get()?.application ?: org.robolectric.RuntimeEnvironment.getApplication()
        ConsentHost.configure(application, host?.get(), core, autoPresent, PRIVACY_URL, owner, events)
        idle()
    }

    private fun host() = Robolectric.buildActivity(HostActivity::class.java).setup().visible().also { hosts += it }

    private fun idle() = shadowOf(Looper.getMainLooper()).idle()

    private fun presenter(): ConsentPresenter? {
        val field = ConsentHost::class.java.getDeclaredField("held").apply { isAccessible = true }
        val session = field.get(ConsentHost) ?: return null
        return (session.javaClass.getDeclaredField("prompt").apply { isAccessible = true }.get(session) as ConsentPrompt).presenter
    }

    private fun await(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) {
            Thread.sleep(10)
            idle()
        }
        assertTrue("Native action did not finish", condition())
    }

    private class MemoryStore : KeyValueStore {
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
    }

    private fun fixture(name: String) = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
        .map { File(it, "examples/native/consent-demo/fixtures/$name") }.first { it.exists() }.readText()

    private fun transport(config: NativeConfig, body: String) = HostedTransport(object : HttpClient {
        override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
            HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"), body) else HttpResponse(503)
    }, config)

    private fun boot(name: String): ConsentCore {
        val config = NativeConfig("https://fixture.invalid")
        return ConsentCore(config, C15tStore(MemoryStore()), transport = transport(config, fixture(name)), executor = TaskExecutor.DIRECT)
            .also { it.bootstrap() }
    }

    private fun install(store: KeyValueStore): ConsentCore {
        val config = NativeConfig("https://fixture.invalid")
        return C15t.bootstrap(config, C15tStore(store), transport = transport(config, fixture("category-init.json")), executor = TaskExecutor.DIRECT)
    }

    companion object { private const val PRIVACY_URL = "https://app.test/privacy" }
}
