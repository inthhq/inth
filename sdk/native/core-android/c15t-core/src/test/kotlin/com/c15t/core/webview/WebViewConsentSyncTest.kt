package com.c15t.core.webview

import com.c15t.core.store.C15tStore
import com.c15t.core.InMemoryKeyValueStore
import com.c15t.core.RecordingTransport
import com.c15t.core.initSuccess
import com.c15t.core.CommitIntent
import com.c15t.core.model.KernelUser
import com.c15t.core.testKernel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The ordering and replacement rules both platform helpers depend on. The
 * Android `ConsentWebView` and the Swift one only connect this logic to a real
 * WebView.
 */
class WebViewConsentSyncTest {
	/** What a WebView received, and a main-thread queue the test drains. */
	private class RecordingTarget(private val onInstall: (Int) -> Unit = {}) : WebViewConsentSync.Target {
		val installed = mutableListOf<String>()
		val evaluated = mutableListOf<String>()
		var uninstalls = 0

		override fun install(script: String) {
			installed += script
			onInstall(installed.size)
		}

		override fun evaluate(script: String) {
			evaluated += script
		}

		override fun uninstall() {
			uninstalls += 1
		}
	}

	private val queue = ArrayDeque<() -> Unit>()
	private val post: (() -> Unit) -> Unit = { queue.addLast(it) }

	private fun drain() {
		while (queue.isNotEmpty()) queue.removeFirst()()
	}

	private fun core() = testKernel(store = C15tStore(InMemoryKeyValueStore()), transport = RecordingTransport())
		.also { it.bootstrap() }

	/** A ready core whose visitor accepted everything, so a page holds real grants. */
	private fun grantedCore() = testKernel(
		store = C15tStore(InMemoryKeyValueStore()),
		transport = RecordingTransport().respondInit(initSuccess()),
	).also {
		it.bootstrap()
		it.save(CommitIntent.All)
		assertTrue(it.snapshot().effectivePermissions.marketing, "the fixture grants marketing")
	}

	private fun revisionIn(script: String): Long =
		Regex(""""revision":(\d+)""").find(script)!!.groupValues[1].toLong()

	private fun tokenIn(script: String): String =
		Regex("""\],"([0-9a-f]{32})",""").find(script)!!.groupValues[1]

	@Test fun `a change between the first read and the subscription still reaches the page`() {
		val core = core()
		// The core moves while the first state is being installed, which is the
		// window between reading the snapshot and subscribing.
		val target = RecordingTarget { installs ->
			if (installs == 1) core.identify(KernelUser(externalId = "user-1"))
		}
		WebViewConsentSync.start(core, listOf("https://app.example"), target, post = post)
		drain()
		assertEquals(core.snapshot().revision, revisionIn(target.evaluated.last()))
		assertTrue(target.evaluated.size >= 2, "the change is pushed after the first state")
	}

	/** How many snapshot callbacks the core holds. */
	private fun registrations(core: com.c15t.core.ConsentCore): Int =
		(com.c15t.core.ConsentCore::class.java.getDeclaredField("snapshotObservers")
			.apply { isAccessible = true }.get(core) as Collection<*>).size

	/** Start a sync and keep nothing of it but a weak reference. */
	private fun abandonedSync(core: com.c15t.core.ConsentCore, target: RecordingTarget) =
		java.lang.ref.WeakReference(WebViewConsentSync.start(core, listOf("https://app.example"), target, post = post))

	@Test fun `a sync collected without close lets go of its core registration`() {
		val core = core()
		val before = registrations(core)
		val target = RecordingTarget()
		val sync = abandonedSync(core, target)
		assertEquals(before + 1, registrations(core))
		repeat(50) {
			if (sync.get() == null) return@repeat
			System.gc()
			Thread.sleep(10)
		}
		kotlin.test.assertNull(sync.get(), "nothing but the test held the sync")

		core.identify(KernelUser(externalId = "user-1"))
		drain()

		assertEquals(before, registrations(core), "the callback closed its own registration")
		assertEquals(1, target.installed.size, "a collected sync pushes nothing")
	}

	@Test fun `an unchanged state is not pushed again`() {
		val core = core()
		val target = RecordingTarget()
		val sync = WebViewConsentSync.start(core, listOf("https://app.example"), target, post = post)
		sync.publish()
		drain()
		assertEquals(1, target.installed.size)
		assertEquals(1, target.evaluated.size)
	}

	@Test fun `a replacement keeps the token a loaded page already holds`() {
		val core = core()
		val first = RecordingTarget()
		val original = WebViewConsentSync.start(core, listOf("https://app.example"), first, post = post)
		val loadedToken = tokenIn(first.installed.single())

		val second = RecordingTarget()
		WebViewConsentSync.start(core, listOf("https://app.example"), second, replacing = original, post = post)
		core.identify(KernelUser(externalId = "user-1"))
		drain()

		assertEquals(1, first.uninstalls, "the replaced sync removes its script")
		assertEquals(loadedToken, tokenIn(second.evaluated.last()), "the loaded page accepts the update")
		assertEquals(1, first.evaluated.size, "the replaced sync stops pushing")
	}

	@Test fun `separate WebViews get separate secrets`() {
		val core = core()
		val first = RecordingTarget()
		val second = RecordingTarget()
		WebViewConsentSync.start(core, listOf("https://app.example"), first, post = post)
		WebViewConsentSync.start(core, listOf("https://app.example"), second, post = post)
		assertNotEquals(tokenIn(first.installed.single()), tokenIn(second.installed.single()))
	}

	@Test fun `close removes the script and stops pushing`() {
		val core = core()
		val target = RecordingTarget()
		val sync = WebViewConsentSync.start(core, listOf("https://app.example"), target, post = post)
		sync.close()
		sync.close()
		core.identify(KernelUser(externalId = "user-1"))
		drain()
		assertEquals(1, target.uninstalls)
		assertEquals(2, target.evaluated.size, "the first state, then the revocation, and nothing after")
	}

	@Test fun `close tells the loaded page to stop following the app`() {
		val core = grantedCore()
		val target = RecordingTarget()
		val sync = WebViewConsentSync.start(core, listOf("https://app.example"), target, post = post)
		val token = tokenIn(target.installed.single())
		assertTrue(target.evaluated.single().contains(""""marketing":true"""), "the page was given the grant")
		sync.close()
		val revocation = target.evaluated.last()
		assertTrue(revocation.contains("""(["https://app.example"],"$token","""), revocation)
		assertTrue(revocation.contains(""""ready":false"""))
		assertTrue(revocation.contains(""""marketing":false"""))
	}

	@Test fun `dropping an origin revokes the page loaded from it, and only that one`() {
		val core = grantedCore()
		val first = RecordingTarget()
		val original = WebViewConsentSync.start(
			core, listOf("https://old.example", "https://kept.example"), first, post = post,
		)
		val token = tokenIn(first.installed.single())
		val second = RecordingTarget()
		WebViewConsentSync.start(core, listOf("https://kept.example"), second, replacing = original, post = post)

		val revocation = first.evaluated.last()
		assertTrue(revocation.contains("""(["https://old.example"],"$token","""), revocation)
		assertTrue(revocation.contains(""""ready":false"""))
		assertEquals(2, first.evaluated.size, "one revocation, for the dropped origin only")
		assertTrue(second.evaluated.single().contains("""(["https://kept.example"],"$token","""))
	}
}
