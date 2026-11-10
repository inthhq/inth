package com.c15t.consentui

import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import com.c15t.core.C15t
import com.c15t.core.ConsentCore
import java.util.WeakHashMap

/**
 * The app's consent prompt for one core, shared by every screen that shows it.
 *
 * [C15tConsent] and [attachConsent] attach a screen to it. However many screens attach, the
 * prompt has one [presenter], so it opens at most once at a time, keeps its draft across
 * rotation and Activity recreation, and is not shown again for a prompt the person already
 * answered or dismissed. Only one attached screen draws it: the one that attached first, or a
 * started screen when the one drawing it stops.
 *
 * Use it from the main thread.
 */
class ConsentPrompt private constructor(val core: ConsentCore) {
    private val store = ViewModelStore()

    /** The presenter behind the prompt. Auto-present stays off until a screen attaches. */
    val presenter: ConsentPresenter = ViewModelProvider(store, object : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return ConsentPresenter(core, autoPresent = false) as T
        }
    })[ConsentPresenter::class.java]

    /**
     * Called on the main thread each time a prompt or settings session closes, with how it ended.
     * A step that has to follow the consent prompt, such as a platform permission request,
     * starts here.
     */
    var onFinished: ((ConsentPresenterOutcome) -> Unit)? = null

    internal var host by mutableStateOf<Any?>(null); private set
    internal var hostStarted by mutableStateOf(false); private set

    init { presenter.onOutcome = { onFinished?.invoke(it) } }

    /** Open an owed prompt now. Does nothing while a prompt or settings session is open. */
    fun presentPrompt() = presenter.presentPrompt()

    /** Open privacy settings, also when no prompt is owed. Does nothing while a session is open. */
    fun presentPreferences() = presenter.presentPreferences()

    /**
     * Let the screen behind [token] draw the prompt if nobody draws it, or if the screen drawing
     * it stopped and this one is started.
     * @return Whether [token] draws the prompt now.
     */
    internal fun attach(token: Any, started: Boolean, autoPresent: Boolean): Boolean {
        if (host == null || host === token || started && !hostStarted) {
            host = token
            hostStarted = started
            presenter.autoPresent = autoPresent
        }
        return host === token
    }

    /**
     * The screen behind [token] went away. Another attached screen takes over. Until one does,
     * nothing presents by itself, so a screen that attaches later with `autoPresent = false`
     * finds nothing open.
     */
    internal fun detach(token: Any) {
        if (host === token) { host = null; hostStarted = false; presenter.autoPresent = false }
    }

    companion object {
        private val byCore = WeakHashMap<ConsentCore, ConsentPrompt>()

        /** The prompt for [core]. Every call with the same core returns the same instance. */
        @JvmStatic
        fun of(core: ConsentCore): ConsentPrompt = synchronized(byCore) { byCore.getOrPut(core) { ConsentPrompt(core) } }

        /** The prompt for the installed core, or `null` before the app installs one. */
        @JvmStatic
        val current: ConsentPrompt? get() = C15t.current?.let(::of)
    }
}

/**
 * The stock consent UI for a Compose screen, in one call.
 *
 * Put it beside the screen's content. Once the core is ready it presents an owed prompt by
 * itself, once per owed prompt, and stays quiet while a stored choice is still valid. A new
 * policy or an expired choice prompts again. Open settings from your own control with
 * [ConsentPrompt.presentPreferences].
 *
 * ```kotlin
 * Box(Modifier.fillMaxSize()) {
 *     AppContent()
 *     C15tConsent(privacyPolicyUrl = "https://your-app.example/privacy")
 * }
 * ```
 *
 * @param privacyPolicyUrl The app's HTTPS privacy policy. Links open the system browser.
 * @param autoPresent `false` shows nothing until [ConsentPrompt.presentPrompt] or
 *   [ConsentPrompt.presentPreferences] is called.
 * @param theme Appearance. `null` uses [ConsentTheme.current] with the manifest's values applied.
 * @param core The core to follow. Defaults to the one the app installed.
 * @throws IllegalArgumentException When no core is installed.
 */
@Composable
fun C15tConsent(
    privacyPolicyUrl: String,
    autoPresent: Boolean = true,
    theme: ConsentTheme? = null,
    core: ConsentCore = requireNotNull(C15t.current) { "Install c15t before showing the consent prompt" },
) = ConsentPromptHost(ConsentPrompt.of(core), privacyPolicyUrl, autoPresent, theme, Modifier.fillMaxSize())

@Composable
internal fun ConsentPromptHost(prompt: ConsentPrompt, privacyPolicyUrl: String, autoPresent: Boolean, theme: ConsentTheme?, noticeModifier: Modifier) {
    val token = remember { Any() }
    val started = LocalLifecycleOwner.current.lifecycle.currentStateAsState().value.isAtLeast(Lifecycle.State.STARTED)
    DisposableEffect(prompt) { onDispose { prompt.detach(token) } }
    LaunchedEffect(prompt, started, autoPresent, prompt.host, prompt.hostStarted) { prompt.attach(token, started, autoPresent) }
    if (prompt.host === token) C15tConsent(prompt.presenter, privacyPolicyUrl, noticeModifier, theme)
}

/**
 * The stock consent UI for an Activity that does not use Compose for its content, in one call.
 *
 * Call it in `onCreate`, after `setContentView`, on every creation: the prompt and its draft
 * survive rotation and recreation. It behaves like [C15tConsent].
 *
 * ```kotlin
 * override fun onCreate(savedInstanceState: Bundle?) {
 *     super.onCreate(savedInstanceState)
 *     setContentView(R.layout.main)
 *     val consent = attachConsent("https://your-app.example/privacy")
 *     findViewById<Button>(R.id.privacy).setOnClickListener { consent.presentPreferences() }
 * }
 * ```
 *
 * @return The shared prompt, for a privacy-settings control.
 * @throws IllegalArgumentException When no core is installed.
 */
fun ComponentActivity.attachConsent(
    privacyPolicyUrl: String,
    autoPresent: Boolean = true,
    theme: ConsentTheme? = null,
    core: ConsentCore = requireNotNull(C15t.current) { "Install c15t before showing the consent prompt" },
): ConsentPrompt {
    val prompt = ConsentPrompt.of(core)
    val view = ComposeView(this)
    view.setContent { ConsentPromptHost(prompt, privacyPolicyUrl, autoPresent, theme, Modifier.fillMaxWidth()) }
    addContentView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    return prompt
}
