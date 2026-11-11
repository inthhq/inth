package com.c15t.consentui

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.ui.platform.ComposeView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Modifier
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.c15t.core.ConsentCore
import java.lang.ref.WeakReference
import java.util.UUID

/** What an open host session shows. */
enum class ConsentHostPresentation {
    /** The owed prompt: a first layer or a notice. */
    PROMPT,

    /** Standing privacy settings. */
    PREFERENCES,
}

/** What [ConsentHost.present] did with a request. */
sealed interface ConsentHostSession {
    /** A new session opened. Its outcome arrives once, through the `outcome` callback. */
    data class Presented(val sessionId: String, val presentation: ConsentHostPresentation) : ConsentHostSession

    /** A session was already open. The request reused it and its draft; [presentation] is what that session shows. */
    data class AlreadyPresented(val sessionId: String, val presentation: ConsentHostPresentation) : ConsentHostSession

    /** A prompt request found no prompt owed, so nothing opened. Preferences never answer this. */
    data object NotRequired : ConsentHostSession
}

/** How a host session ended. Delivered once per session. */
sealed interface ConsentHostOutcome {
    /** The session that ended. */
    val sessionId: String

    /** The core's snapshot revision when the session ended. */
    val revision: Long

    /** A decision was saved durably on the device. */
    data class Committed(override val sessionId: String, override val revision: Long) : ConsentHostOutcome

    /** A notice was acknowledged. No consent decision was recorded. */
    data class Acknowledged(override val sessionId: String, override val revision: Long) : ConsentHostOutcome

    /** The subject closed the session without a decision. */
    data class Dismissed(override val sessionId: String, override val revision: Long) : ConsentHostOutcome

    /** The session closed because the policy was still unresolved. */
    data class Unavailable(override val sessionId: String, override val revision: Long) : ConsentHostOutcome
}

/**
 * Draws the app's [ConsentPrompt] over the app's own Activities, for a runtime that owns no
 * Compose tree of its own, such as React Native.
 *
 * The prompt decides. [configure] attaches this host to it with the runtime's `autoPresent`, and
 * from then on the prompt opens an owed prompt by itself, once per owed prompt, exactly as it does
 * for [C15tConsent]. This host only puts what the prompt opened on screen, on the Activity in the
 * foreground, and reports it: [Listener.presented] once a session is on screen,
 * [Listener.unavailable] while an owed prompt has no Activity to show on yet, and one outcome per
 * session. An owed prompt that cannot show yet stays owed and shows once an Activity resumes, so it
 * is not lost across backgrounding, rotation, a host Activity that is not ready yet, or
 * [com.c15t.core.C15t.uninstall] followed by a new install. [present] opens a session the app
 * asked for, through the same prompt, so what the person dismissed counts either way.
 *
 * Use it from the main thread.
 */
object ConsentHost {
    /** What this host tells its runtime besides each request's answer. Called on the main thread. */
    interface Listener {
        /** A session is on screen: one the prompt opened by itself ([automatic]), or one the app asked for. */
        fun presented(sessionId: String, presentation: ConsentHostPresentation, automatic: Boolean)

        /** An owed prompt has no Activity to show on yet. It shows once one resumes; nothing has to ask again. */
        fun unavailable(code: String, message: String)

        /** How a session ended. Delivered once per session, after the session that replaced it is reported. */
        fun outcome(outcome: ConsentHostOutcome)
    }

    private class Session(val id: String, val prompt: ConsentPrompt, val privacyPolicyUrl: String,
        var outcome: ((ConsentHostOutcome) -> Unit)?, val notice: Boolean, val preferences: Boolean, val automatic: Boolean) {
        val presenter get() = prompt.presenter
        /** What the session shows. */
        val presentation get() = if (preferences) ConsentHostPresentation.PREFERENCES else ConsentHostPresentation.PROMPT
        /** Whether anything of this session is on screen or still saving. */
        val showing get() = presenter.presentationID != null || presenter.noticeVisible || presenter.pending
        var activity = WeakReference<ConsentHostActivity>(null)
        /** A [ConsentHostActivity] was started for this session and has not attached yet. */
        var launching = false
        var noticeView = WeakReference<ComposeView>(null)
        var noticeActivity = WeakReference<Activity>(null)
        var noticeApplication: Application? = null
        var noticeLifecycle: Application.ActivityLifecycleCallbacks? = null
    }

    /** This host's claim on the prompt, beside any Compose screen's. */
    private val token = Any()
    /** The prompt this host follows: the installed core's, dropped when that core is uninstalled. */
    private var prompt: ConsentPrompt? = null
    /** Hears the followed core, so what its prompt opens by itself is shown. */
    private var subscription: com.c15t.core.Subscription? = null
    /** Owned here: the core holds the subscription's callback only through [subscription]. */
    private var observer: ((com.c15t.core.model.ConsentSnapshot) -> Unit)? = null
    private val main by lazy { android.os.Handler(android.os.Looper.getMainLooper()) }
    private var autoPresent = false
    private var privacyPolicyUrl: String? = null
    private var listener: Listener? = null
    private var owner = WeakReference<Any>(null)
    /** The app's own Activity in the foreground, which an automatic session is shown on. */
    private var foreground = WeakReference<Activity>(null)
    private var application: Application? = null
    /** The owed prompt last reported as having no Activity, so it is reported once. */
    private var unavailableFor: String? = null
    /** The session on screen. Read it through [current], which never returns one that shows nothing. */
    private var held: Session? = null

    init {
        com.c15t.core.C15t.onUninstall { core -> if (prompt?.core === core) drop(core) }
    }

    /**
     * The open session, derived from what is on screen: a held session that shows nothing (its
     * notice was cleared by `dismissNotice()` or a reset, with no decision to close it) is ended
     * here with a dismissed outcome, so no request is ever answered with a session that is not
     * visible.
     */
    private fun current(): Session? {
        held?.takeIf { !it.showing }?.let { finish(it, ConsentPresenterOutcome.DISMISSED) }
        return held
    }
    private const val NOTICE_SESSION_STATE = "com.c15t.consentui.notice.session"

    /**
     * Attach this host to [core]'s prompt with the runtime's settings. Call it again whenever they
     * change. With [autoPresent] on, the prompt presents an owed prompt by itself; with it off,
     * nothing opens until [present], and a session the prompt opened by itself that is not on
     * screen yet is withdrawn, so an app that opted out never sees a prompt it did not ask for.
     *
     * @param activity The Activity in the foreground now, if any.
     * @param privacyPolicyUrl The HTTPS privacy policy an automatic prompt links to.
     * @param owner The runtime, so [detach] can tell its sessions apart.
     * @throws IllegalArgumentException When [autoPresent] is on and [privacyPolicyUrl] is not HTTPS.
     */
    fun configure(application: Application, activity: Activity?, core: ConsentCore, autoPresent: Boolean,
        privacyPolicyUrl: String?, owner: Any, listener: Listener) {
        if (autoPresent) requireHttps(privacyPolicyUrl)
        this.owner = WeakReference(owner)
        this.listener = listener
        this.autoPresent = autoPresent
        if (privacyPolicyUrl != null) this.privacyPolicyUrl = privacyPolicyUrl
        track(application)
        if (activity != null && activity !is ConsentHostActivity) foreground = WeakReference(activity)
        val attached = attach(core)
        // Opened by itself and never shown: not for an app that has just opted out.
        if (!autoPresent && held == null) attached.presenter.withdrawAutomaticSession()
        reconcile()
    }

    /**
     * Call on the main thread. Repeated requests reuse the current session and its draft.
     *
     * @param outcome Receives how the session ended, once. A repeated request replaces it.
     * @returns Whether a session opened, was already open, or was not needed.
     */
    fun present(activity: Activity, core: ConsentCore, preferences: Boolean, privacyPolicyUrl: String, owner: Any = activity, outcome: (ConsentHostOutcome) -> Unit): ConsentHostSession {
        requireHttps(privacyPolicyUrl)
        track(activity.application)
        if (activity !is ConsentHostActivity) foreground = WeakReference(activity)
        val prompt = attach(core)
        val presenter = prompt.presenter
        // A repeated prompt request re-asks the open session, so a notice cleared and owed again shows.
        held?.takeIf { !preferences }?.presenter?.presentPrompt()
        current()?.let {
            this.owner = WeakReference(owner)
            it.outcome = outcome
            show(it, activity)
            return ConsentHostSession.AlreadyPresented(it.id, it.presentation)
        }
        // The prompt opened a session by itself that had no Activity to show on until now.
        if (presenter.presentationID != null || presenter.noticeVisible) {
            val session = open(activity, prompt, privacyPolicyUrl, automatic = true, outcome = outcome)
            return ConsentHostSession.AlreadyPresented(session.id, session.presentation)
        }
        val snapshot = core.snapshot()
        if (!preferences && (snapshot.policyPending || !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice))
            return ConsentHostSession.NotRequired
        if (preferences) prompt.presentPreferences() else prompt.presentPrompt()
        if (presenter.presentationID == null && !presenter.noticeVisible) return ConsentHostSession.NotRequired
        this.owner = WeakReference(owner)
        val session = open(activity, prompt, privacyPolicyUrl, automatic = false, outcome = outcome)
        return ConsentHostSession.Presented(session.id, session.presentation)
    }

    fun close(sessionID: String) { current()?.takeIf { it.id == sessionID }?.presenter?.requestClose() }

    /**
     * Detach a torn-down runtime without cancelling native durable work. A session on screen stays
     * for the person to finish; nothing presents by itself until a runtime configures this host again.
     */
    fun detach(owner: Any) {
        if (this.owner.get() !== owner) return
        held?.outcome = null
        this.owner.clear()
        listener = null
        autoPresent = false
        prompt?.detach(token)
    }

    /**
     * Follow [core]'s prompt with the current settings. A core installed after an uninstall gets a
     * new prompt, and this host moves to it, so an owed prompt is presented on the new core too.
     */
    fun follow(core: ConsentCore) {
        if (listener != null) { attach(core); reconcile() }
    }

    internal fun attach(activity: ConsentHostActivity, id: String?): Boolean {
        val session = current()?.takeIf { it.id == id } ?: return false
        session.activity = WeakReference(activity)
        session.launching = false
        activity.setContent { C15tConsent(session.presenter, session.privacyPolicyUrl) }
        return true
    }

    private fun requireHttps(privacyPolicyUrl: String?) {
        val uri = android.net.Uri.parse(privacyPolicyUrl ?: "")
        require(uri.scheme == "https" && !uri.host.isNullOrBlank()) { "An HTTPS privacy-policy URL is required" }
    }

    /** Attach this host's claim to [core]'s prompt, moving from another core's if it changed. */
    private fun attach(core: ConsentCore): ConsentPrompt {
        val next = ConsentPrompt.of(core)
        val previous = prompt
        if (previous !== next) {
            previous?.let { old ->
                old.onHostFinished = null
                old.detach(token)
                // A session of a core this host no longer follows is not the runtime's any more.
                held?.takeIf { it.prompt === old }?.let { held = null; release(it) }
            }
            subscription?.close()
            prompt = next
            next.onHostFinished = { finished(next, it) }
            // After the presenter has applied the same change, which it hears first: a notice
            // cleared outside a session ends it, so its outcome reaches the runtime, and what the
            // prompt opened by itself is shown. Not Compose state: an app with no Compose UI yet
            // never sends its apply notifications.
            val listener: (com.c15t.core.model.ConsentSnapshot) -> Unit = { main.post { if (prompt === next) reconcile() } }
            observer = listener
            subscription = core.onChange(listener)
        }
        next.attach(token, started = true, autoPresent = autoPresent && listener != null)
        return next
    }

    private fun drop(core: ConsentCore) {
        val dropped = prompt ?: return
        held?.takeIf { it.prompt === dropped }?.let {
            val revision = core.snapshot().revision
            held = null
            release(it)
            deliver(it, ConsentHostOutcome.Unavailable(it.id, revision))
        }
        dropped.onHostFinished = null
        subscription?.close()
        subscription = null
        observer = null
        prompt = null
    }

    /** Track the app's foreground Activity, so a session that opens by itself has somewhere to show. */
    private fun track(app: Application) {
        if (application === app) return
        application?.unregisterActivityLifecycleCallbacks(foregroundCallbacks)
        application = app
        app.registerActivityLifecycleCallbacks(foregroundCallbacks)
    }

    private val foregroundCallbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                if (activity is ConsentHostActivity) return
                foreground = WeakReference(activity)
                com.c15t.core.C15t.current?.let(::follow) ?: reconcile()
            }
            override fun onActivityPaused(activity: Activity) {
                if (foreground.get() === activity) foreground.clear()
            }
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityStarted(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
    }

    /** End a held session that shows nothing, and show what the prompt opened by itself. */
    private fun reconcile() {
        val prompt = prompt ?: return
        if (current() != null || prompt.host !== token) return
        val presenter = prompt.presenter
        if (presenter.presentationID == null && !presenter.noticeVisible) { unavailableFor = null; return }
        val url = privacyPolicyUrl ?: return
        val activity = foreground.get()?.takeIf { !it.isFinishing && !it.isDestroyed }
        val failure = if (activity == null) "No Activity is in the foreground to show the owed consent prompt on yet"
        else try { open(activity, prompt, url, automatic = true, outcome = null); return } catch (error: Exception) { error.message ?: error.toString() }
        val key = presenter.presentationID ?: "notice"
        if (unavailableFor != key) {
            unavailableFor = key
            listener?.unavailable("C15T_PRESENTER_UNAVAILABLE", failure)
        }
    }

    /** Hold what [prompt] shows now as a session, put it on [activity], and report it. */
    private fun open(activity: Activity, prompt: ConsentPrompt, privacyPolicyUrl: String, automatic: Boolean,
        outcome: ((ConsentHostOutcome) -> Unit)?): Session {
        val presenter = prompt.presenter
        val notice = presenter.presentationID == null && presenter.noticeVisible
        val session = Session(presenter.presentationID ?: UUID.randomUUID().toString(), prompt, privacyPolicyUrl, outcome,
            notice, presenter.preferences && !presenter.returnsToFirstLayer, automatic)
        held = session
        unavailableFor = null
        try { show(session, activity) } catch (error: Exception) {
            held = null
            release(session)
            // One the prompt opened by itself stays open, to show once an Activity can take it. One
            // the app asked for is withdrawn: not on screen, so not the person's, and still owed.
            if (!automatic) presenter.withdrawSession()
            throw error
        }
        listener?.presented(session.id, session.presentation, automatic)
        return session
    }

    /** Put [session] on [activity]: the notice card in its content, anything else in a [ConsentHostActivity]. */
    private fun show(session: Session, activity: Activity) {
        if (session.notice) return attachNotice(activity, session)
        val host = session.activity.get()
        if (session.launching || host != null && !host.isFinishing && !host.isDestroyed) return
        session.launching = true
        try {
            activity.startActivity(Intent(activity, ConsentHostActivity::class.java).putExtra("c15t.session", session.id))
        } catch (error: Exception) {
            session.launching = false
            throw error
        }
    }

    private fun finished(prompt: ConsentPrompt, value: ConsentPresenterOutcome) {
        val session = held?.takeIf { it.prompt === prompt } ?: return
        finish(session, value)
    }

    private fun finish(session: Session, value: ConsentPresenterOutcome) {
        if (held !== session) return
        val presenter = session.presenter
        val snapshot = session.prompt.core.snapshot()
        val result = when {
            value == ConsentPresenterOutcome.DISMISSED && snapshot.policyPending -> ConsentHostOutcome.Unavailable(session.id, snapshot.revision)
            value == ConsentPresenterOutcome.DISMISSED -> ConsentHostOutcome.Dismissed(session.id, snapshot.revision)
            session.notice && !presenter.preferences -> ConsentHostOutcome.Acknowledged(session.id, snapshot.revision)
            else -> ConsentHostOutcome.Committed(session.id, snapshot.revision)
        }
        held = null
        release(session)
        // The prompt that follows, if one is owed, is on screen and reported before this outcome,
        // so a step that waits for c15t's screens to close, such as Apple's tracking request,
        // never runs between the two.
        presenter.presentIfOwed()
        reconcile()
        deliver(session, result)
    }

    private fun deliver(session: Session, result: ConsentHostOutcome) {
        val callback = session.outcome ?: listener?.let { it::outcome }
        session.outcome = null
        callback?.invoke(result)
    }

    private fun release(session: Session) {
        releaseNotice(session)
        session.activity.get()?.finish()
        session.activity.clear()
    }

    private fun attachNotice(activity: Activity, session: Session) {
        val existing = session.noticeView.get()
        if (existing?.isAttachedToWindow == true && existing.context === activity) return
        removeNotice(session)
        session.noticeActivity = WeakReference(activity)
        observeNoticeLifecycle(activity.application, session)
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val view = ComposeView(activity)
        view.setContent { C15tConsent(session.presenter, session.privacyPolicyUrl, noticeModifier = Modifier.fillMaxWidth()) }
        content.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        session.noticeView = WeakReference(view)
        session.launching = false
    }
    private fun observeNoticeLifecycle(application: Application, session: Session) {
        if (session.noticeLifecycle != null) return
        val callbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
                if (held === session && savedInstanceState?.getString(NOTICE_SESSION_STATE) == session.id) {
                    session.noticeActivity = WeakReference(activity)
                }
            }
            override fun onActivityResumed(activity: Activity) {
                if (held === session && session.noticeActivity.get() === activity) attachNotice(activity, session)
            }
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {
                if (held === session && session.noticeActivity.get() === activity) {
                    outState.putString(NOTICE_SESSION_STATE, session.id)
                }
            }
            override fun onActivityDestroyed(activity: Activity) {
                if (session.noticeActivity.get() === activity) {
                    removeNotice(session)
                    session.noticeActivity.clear()
                }
            }
            override fun onActivityStarted(activity: Activity) = Unit
            override fun onActivityPaused(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
        }
        session.noticeApplication = application
        session.noticeLifecycle = callbacks
        application.registerActivityLifecycleCallbacks(callbacks)
    }
    private fun releaseNotice(session: Session) {
        session.noticeLifecycle?.let { session.noticeApplication?.unregisterActivityLifecycleCallbacks(it) }
        session.noticeLifecycle = null
        session.noticeApplication = null
        removeNotice(session)
        session.noticeActivity.clear()
    }
    private fun removeNotice(session: Session) {
        session.noticeView.get()?.let {
            (it.parent as? ViewGroup)?.removeView(it)
            it.disposeComposition()
        }
        session.noticeView.clear()
    }
}

/** Shares drafts and pending work across configuration changes. No exported launch entry. */
class ConsentHostActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!ConsentHost.attach(this, intent.getStringExtra("c15t.session"))) finish()
    }
}
