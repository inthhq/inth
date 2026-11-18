package com.inth.consentui

import com.inth.core.Inth
import com.inth.core.ConsentCore
import com.inth.core.NativeConfig
import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.HostedTransport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.io.File
import java.lang.ref.WeakReference

/** The shared prompt lives as long as its core is installed, and never keeps a core alive. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConsentPromptLifetimeTest {
    @Before fun main() { Dispatchers.setMain(Dispatchers.Unconfined); Inth.uninstall() }
    @After fun reset() { Inth.uninstall(); Dispatchers.resetMain() }

    @Test fun anUninstalledCoreIsCollectedWithItsPrompt() {
        val (core, prompt) = installWithPrompt()
        collect { false }
        assertNotNull("the installed core keeps its prompt, and the dismissal in it, between screens", prompt.get())

        Inth.uninstall()
        collect { core.get() == null }
        assertNull("an uninstalled core is collectable", core.get())
        assertNull("and so is its prompt", prompt.get())
    }

    @Test fun aCoreReplacedByANewInstallIsCollected() {
        val (first, _) = installWithPrompt()
        Inth.uninstall()
        val (second, prompt) = installWithPrompt()
        collect { first.get() == null }
        assertNull("the core installed before is collectable", first.get())
        assertNotNull("the core installed now keeps its prompt", prompt.get())
    }

    /** Kept out of the test bodies, so no local variable holds the core or the prompt. */
    private fun installWithPrompt(): Pair<WeakReference<ConsentCore>, WeakReference<ConsentPrompt>> {
        val body = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
            .map { File(it, "examples/native/consent-demo/fixtures/category-init.json") }.first { it.exists() }.readText()
        val config = NativeConfig("https://fixture.invalid")
        val client = object : HttpClient {
            override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
                HttpResponse(200, emptyMap(), body) else HttpResponse(503)
        }
        val store = object : KeyValueStore {
            private val values = java.util.concurrent.ConcurrentHashMap<String, String>()
            override fun read(key: String) = values[key]
            override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
            override fun writeDurably(key: String, value: String?): Boolean { write(key, value); return true }
        }
        val core = Inth.bootstrap(config, InthStore(store), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
        val prompt = ConsentPrompt.of(core)
        val screen = Any()
        prompt.attach(screen, started = true, autoPresent = true)
        assertNotNull("the owed prompt opened", prompt.presenter.presentationID)
        prompt.detach(screen)
        return WeakReference(core) to WeakReference(prompt)
    }

    private fun collect(done: () -> Boolean) {
        repeat(20) {
            if (done()) return
            System.gc()
            System.runFinalization()
            Thread.sleep(20)
        }
    }
}
