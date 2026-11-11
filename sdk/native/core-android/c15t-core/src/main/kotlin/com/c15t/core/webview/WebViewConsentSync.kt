package com.c15t.core.webview

import com.c15t.core.ConsentCore
import com.c15t.core.Subscription
import java.lang.ref.WeakReference

/**
 * Keeps one WebView in step with a [ConsentCore], with no Android in it.
 *
 * The platform glue (the Android `ConsentWebView`, or a host's own) supplies a
 * [Target] that installs and runs scripts, and a `post` that runs work on the
 * WebView's thread. Everything else, and every ordering rule, lives here so a
 * plain JVM test can check it:
 *
 * - the core is observed before the first state is read, so a change between the
 *   two is not missed;
 * - an unchanged state is not pushed again;
 * - a replacement keeps the secrets of the sync it replaces, because a loaded
 *   page only accepts the token it was given at document start;
 * - an origin that stops being listed is revoked first: a page loaded from it
 *   gets a "no state" update it still accepts, so it cannot keep the last state,
 *   grants included, after the app stops talking to it. [close] revokes them all.
 *
 * Every method runs on the WebView's thread.
 */
class WebViewConsentSync private constructor(
	private val core: ConsentCore,
	/** The scripts this sync injects, with the secrets it uses. */
	val script: WebViewConsentScript,
	private val target: Target,
	private val post: (() -> Unit) -> Unit,
) : AutoCloseable {
	/** Where the scripts go. Calls arrive on the WebView's thread. */
	interface Target {
		/** Replace this sync's document-start script with [script]. */
		fun install(script: String)

		/** Run [script] in the loaded main frame. */
		fun evaluate(script: String)

		/** Remove this sync's document-start script. */
		fun uninstall()
	}

	private var subscription: Subscription? = null
	private var published: WebViewConsentState? = null
	private var closed = false

	private fun start() {
		// The core holds this callback until [close]. It reaches the sync weakly, so a
		// sync dropped without close() is collected with its WebView, not kept by the core.
		val sync = WeakReference(this)
		subscription = core.onChange { sync.get()?.let { it.post { it.publish() } } }
		publish()
	}

	/** Push the current state, if it changed since the last push. */
	fun publish() {
		if (closed) return
		val state = WebViewConsentState.from(core)
		if (state == published) return
		published = state
		target.install(script.documentStart(state))
		// The update script checks the page origin itself, so a page that
		// navigated off the list gets nothing.
		target.evaluate(script.update(state))
	}

	/**
	 * Stop syncing. The loaded page stops following the app (every optional category
	 * denied), and pages loaded afterwards get nothing. Safe to call more than once.
	 */
	override fun close() = close(revoking = script.origins)

	/** Close, revoking only [revoking]: the origins a replacement no longer lists. */
	private fun close(revoking: Collection<String>) {
		if (closed) return
		closed = true
		subscription?.close()
		subscription = null
		if (revoking.isNotEmpty()) target.evaluate(script.revoke(revoking, published))
		target.uninstall()
	}

	companion object {
		/**
		 * Start syncing [core] into [target] for [allowedOrigins].
		 *
		 * @param replacing The sync this one replaces on the same WebView. It is
		 *   closed, and its token and request key carry over.
		 * @param post Runs a block on the WebView's thread.
		 * @throws IllegalArgumentException when an origin is not accepted or the list is empty.
		 */
		fun start(
			core: ConsentCore,
			allowedOrigins: Collection<String>,
			target: Target,
			replacing: WebViewConsentSync? = null,
			post: (() -> Unit) -> Unit,
		): WebViewConsentSync {
			val script = replacing?.script?.replacingOrigins(allowedOrigins) ?: WebViewConsentScript(allowedOrigins)
			replacing?.close(revoking = replacing.script.origins - script.origins.toSet())
			return WebViewConsentSync(core, script, target, post).also { it.start() }
		}
	}
}
