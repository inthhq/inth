package com.inth.consentui

import com.inth.core.CommitIntent
import com.inth.core.ConsentCore
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.PromptReason
import com.inth.core.spi.Clock
import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.HostedTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * The presenter's auto-present bookkeeping, one transition per test: readiness, the opt-out,
 * a manual notice request and its end, and an owed prompt that comes back after nothing was owed.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AutoPresentTest {
    @Before fun main() = Dispatchers.setMain(Dispatchers.Unconfined)
    @After fun reset() = Dispatchers.resetMain()

    @Test fun waitsUntilTheCoreIsReady() {
        val core = core("category-init.json")
        val p = ConsentPresenter(core)
        assertFalse(core.snapshot().ready)
        assertNull(p.presentationID)
        core.bootstrap()
        assertNotNull(p.presentationID)
    }

    @Test fun turningAutoPresentOnPresentsAnAlreadyOwedPrompt() {
        val core = core("category-init.json").also { it.bootstrap() }
        val p = ConsentPresenter(core, autoPresent = false)
        assertNull(p.presentationID)
        p.autoPresent = true
        assertNotNull(p.presentationID)
    }

    /** Dismissing is a fact about the person, not about the setting: it holds once auto-present is on. */
    @Test fun aPromptDismissedWhileAutoPresentWasOffStaysClosedWhenItTurnsOn() {
        val core = core("category-init.json").also { it.bootstrap() }
        val p = ConsentPresenter(core, autoPresent = false)
        p.presentPrompt()
        assertNotNull(p.presentationID)
        p.backFromFirstLayer()
        p.autoPresent = true
        assertNull(p.presentationID)
    }

    @Test fun aManualNoticeRequestEndsWithItsNotice() {
        val core = core("notice-init.json").also { it.bootstrap() }
        val p = ConsentPresenter(core, autoPresent = false)
        p.presentPrompt()
        assertTrue(p.noticeVisible)
        // The notice is cleared outside this presenter, then owed again.
        assertTrue(core.dismissNotice())
        assertFalse(p.noticeVisible)
        core.reset()
        assertTrue(core.snapshot().promptRequirement.notice)
        assertFalse("the opt-out shows nothing the app did not ask for", p.noticeVisible)
        p.presentPrompt()
        assertTrue(p.noticeVisible)
    }

    @Test fun theSameOwedPromptPresentsAgainAfterNothingWasOwed() {
        val core = core("category-init.json").also { it.bootstrap() }
        val p = ConsentPresenter(core)
        val first = p.presentationID
        assertNotNull(first)
        p.backFromFirstLayer()
        assertNull("a dismissed prompt stays closed", p.presentationID)
        assertTrue(core.save(CommitIntent.All).ok)
        core.reset()
        assertTrue(core.snapshot().promptRequirement.acknowledge)
        assertNotNull("the requirement ended and came back, so it presents again", p.presentationID)
        assertNotEquals(first, p.presentationID)
    }

    @Test fun anExpiredChoicePromptsAgain() {
        val now = AtomicLong(1_770_000_000_000)
        val core = core("category-init.json", clock = Clock { now.get() }).also { it.bootstrap() }
        assertTrue(core.save(CommitIntent.All).ok)
        val p = ConsentPresenter(core)
        assertNull(p.presentationID)
        now.addAndGet(31_536_000_001)
        core.refresh()
        assertEquals(PromptReason.EXPIRED, core.snapshot().promptRequirement.reason)
        assertNotNull("an expired choice is owed again", p.presentationID)
    }

    /**
     * The person answers, and before the commit's main-thread continuation runs the same
     * requirement is owed again. The answer ended that prompt, so the new one presents.
     */
    @Test fun thePromptOwedAgainDuringItsCommitPresentsAfterIt() {
        Dispatchers.resetMain()
        val main = StandardTestDispatcher()
        Dispatchers.setMain(main)
        val core = core("category-init.json").also { it.bootstrap() }
        val p = ConsentPresenter(core)
        val first = p.presentationID
        assertNotNull(first)
        p.commit(ConsentPresenter.Action.ACCEPT)
        main.scheduler.runCurrent()
        awaitTrue { core.snapshot().explicitChoice != null }
        core.reset()
        assertTrue(core.snapshot().promptRequirement.acknowledge)
        awaitTrue { main.scheduler.runCurrent(); !p.pending }
        main.scheduler.runCurrent()
        assertNotNull("the prompt owed again presents", p.presentationID)
        assertNotEquals(first, p.presentationID)
    }

    /**
     * The core reads the snapshot it hands observers when it notifies, so concurrent mutations can
     * reach the presenter as the latest state only. Here the deliveries for the answer and the
     * reset stay queued, and the presenter is handed only the final snapshot.
     */
    @Test fun theSamePromptOwedAgainPresentsWhenOnlyTheLatestSnapshotArrives() {
        Dispatchers.resetMain()
        Dispatchers.setMain(StandardTestDispatcher())
        val core = core("category-init.json").also { it.bootstrap() }
        val p = ConsentPresenter(core)
        assertNotNull(p.presentationID)
        p.backFromFirstLayer()
        assertNull(p.presentationID)
        assertTrue(core.save(CommitIntent.All).ok)
        core.reset()
        p.draft.receive(core.snapshot())
        assertNotNull("the same requirement owed again is presented", p.presentationID)
    }

    /**
     * The invariant over random sequences: if a choice is owed, auto-present is on, and nothing is
     * open, then the person dismissed exactly this owed prompt. Anything else means an owed prompt
     * that never shows.
     */
    @Test fun anOwedPromptIsNeverLeftUnshownOverRandomSequences() {
        for (seed in 1..150) runSequence(seed, "category-init.json")
    }

    @Test fun anOwedNoticeIsShownExactlyWhenItShouldBeOverRandomSequences() {
        for (seed in 1..150) runSequence(seed, "notice-init.json")
    }

    /** One screen attached to the shared prompt, as a composable or `attachConsent` would be. */
    private class Host(var autoPresent: Boolean, var started: Boolean)

    /**
     * Random sequences of what the app, the person, the core and the screens can do. Screens
     * attach and detach with either `autoPresent` value, several at once, and start and stop.
     * After every step:
     * (a) an owed choice with auto-present on and nothing open is the one the person dismissed;
     * an owed notice with auto-present on and nothing open is visible;
     * (c) with auto-present off, a visible notice is one the app asked for in this episode;
     * (d) auto-present is the setting of the screen drawing the prompt, and off with none;
     * (e) a screen with `autoPresent = false` draws only a session the app asked for, or one
     * that opened by itself while that screen drew the prompt with auto-present on;
     * (f) nothing opens by itself for an owed prompt the person dismissed, whatever the
     * auto-present setting was when they dismissed it.
     */
    private fun runSequence(seed: Int, fixture: String) {
        val random = java.util.Random(seed.toLong())
        val text = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "examples/native/consent-demo/fixtures/$fixture") }.first { it.exists() }.readText()
        var body = text
        var policies = 0
        val core = core(fixture, body = { body }).also { it.bootstrap() }
        val prompt = ConsentPrompt.of(core)
        val p = prompt.presenter
        val hosts = mutableListOf(Host(autoPresent = true, started = true))
        // Every screen re-claims whenever the drawing screen or its state changes, as the
        // composable's LaunchedEffect does.
        fun reclaim() = repeat(3) { hosts.forEach { prompt.attach(it, it.started, it.autoPresent) } }
        reclaim()
        val manually = Any()
        /** Who asked for the open session: [manually], the screen it opened for, or nobody. */
        // The first screen auto-presents an owed prompt as it attaches, before the first step.
        var opener: Any? = if (p.presentationID != null) hosts[0] else null
        var dismissed: String? = null
        var requested: String? = null
        val trace = mutableListOf<String>()
        fun key(): String {
            val s = core.snapshot()
            return "${s.resolution.fingerprint}:${s.promptRequirement.acknowledge}:${s.promptRequirement.reason}:${s.promptOwedSince}"
        }
        fun settle() = awaitTrue { !p.pending }
        val promptOpen = { p.presentationID != null && (!p.preferences || p.returnsToFirstLayer) }
        repeat(60) {
            val action = listOf("saved", "reset", "policy", "preferences", "manual", "discard", "customize",
                "back", "accept", "save", "toggle", "dismiss-notice", "acknowledge", "attach", "detach",
                "background").let { it[random.nextInt(it.size)] }
            trace += action
            val before = p.presentationID
            when (action) {
                "saved" -> core.save(CommitIntent.All)
                "reset" -> core.reset()
                "policy" -> { policies += 1; body = text.replace("a".repeat(64), "%064d".format(policies)); core.refresh() }
                "preferences" -> p.presentPreferences()
                "manual" -> {
                    val s = core.snapshot()
                    if (p.presentationID == null && !p.pending && s.promptRequirement.notice && !s.promptRequirement.acknowledge) requested = key()
                    p.presentPrompt()
                }
                "discard" -> if (p.presentationID != null && !p.pending) {
                    val closes = !(p.preferences && p.returnsToFirstLayer)
                    if (closes && promptOpen()) dismissed = key()
                    p.discard()
                }
                "customize" -> if (p.presentationID != null && !p.preferences) p.customize()
                "back" -> if (p.presentationID != null && !p.preferences && !p.pending) { dismissed = key(); p.backFromFirstLayer() }
                "accept" -> if (p.presentationID != null) { p.commit(ConsentPresenter.Action.ACCEPT); settle() }
                "save" -> if (p.presentationID != null) {
                    p.setCategory(com.inth.core.model.ConsentCategory.MEASUREMENT, random.nextBoolean())
                    p.commit(ConsentPresenter.Action.SAVE); settle()
                }
                "dismiss-notice" -> core.dismissNotice()
                "acknowledge" -> if (p.noticeVisible) { p.commit(ConsentPresenter.Action.ACKNOWLEDGE); settle() }
                "toggle" -> if (hosts.isNotEmpty()) {
                    val host = hosts[random.nextInt(hosts.size)]
                    host.autoPresent = !host.autoPresent
                    trace += "host ${hosts.indexOf(host)} autoPresent=${host.autoPresent}"
                    reclaim()
                }
                "attach" -> if (hosts.size < 4) {
                    val host = Host(random.nextBoolean(), random.nextBoolean())
                    hosts += host
                    trace += "host ${hosts.size - 1} autoPresent=${host.autoPresent} started=${host.started}"
                    reclaim()
                }
                "detach" -> if (hosts.isNotEmpty()) {
                    val host = hosts.removeAt(random.nextInt(hosts.size))
                    if (opener === host) opener = null
                    prompt.detach(host)
                    reclaim()
                }
                "background" -> if (hosts.isNotEmpty()) {
                    val host = hosts[random.nextInt(hosts.size)]
                    host.started = !host.started
                    reclaim()
                }
            }
            val drawing = hosts.firstOrNull { it === prompt.host }
            val opened = p.presentationID
            if (opened != null && opened != before) {
                opener = if (action == "manual" || action == "preferences") manually else prompt.host
                assertNotEquals("seed $seed ($fixture): a dismissed prompt opened by itself after ${trace.joinToString()}",
                    dismissed.takeIf { opener !== manually }, key())
            }
            // A screen that auto-presents would have opened it itself, so it takes it over.
            if (opened != null && opener !== manually && drawing?.autoPresent == true) opener = drawing
            if (opened == null) opener = null
            assertEquals("seed $seed ($fixture): auto-present is not the drawing screen's after ${trace.joinToString()}",
                drawing?.autoPresent ?: false, p.autoPresent)
            if (drawing != null && !drawing.autoPresent && opened != null) {
                assertTrue("seed $seed ($fixture): a screen that opted out draws a prompt it did not ask for after ${trace.joinToString()}",
                    opener === manually || opener === drawing)
            }
            val s = core.snapshot()
            val ready = s.ready && !s.policyPending
            val owedChoice = ready && s.promptRequirement.acknowledge
            val owedNotice = ready && s.promptRequirement.notice && !s.promptRequirement.acknowledge
            val nothingOpen = p.presentationID == null && !p.pending
            if (owedChoice && p.autoPresent && nothingOpen) {
                assertEquals("seed $seed ($fixture): owed prompt left unshown after ${trace.joinToString()}", dismissed, key())
            }
            if (owedNotice && p.autoPresent && nothingOpen) {
                assertTrue("seed $seed ($fixture): owed notice not shown after ${trace.joinToString()}", p.noticeVisible)
            }
            if (!p.autoPresent && p.noticeVisible) {
                assertEquals("seed $seed ($fixture): a notice the app did not ask for shows after ${trace.joinToString()}", requested, key())
            }
        }
    }

    private fun awaitTrue(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!condition() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue(condition())
    }

    private fun core(fixture: String, clock: Clock = Clock.SYSTEM, body: (() -> String)? = null): ConsentCore {
        val fixed = if (body != null) "" else generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "examples/native/consent-demo/fixtures/$fixture") }.first { it.exists() }.readText()
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, emptyMap(), body?.invoke() ?: fixed) else HttpResponse(503)
        }
        val store = object : KeyValueStore {
            private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
            override fun read(key: String) = values[key]
            override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
            override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
        }
        val config = NativeConfig("https://fixture.invalid")
        return ConsentCore(config, InthStore(store), clock = clock, transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
    }
}
