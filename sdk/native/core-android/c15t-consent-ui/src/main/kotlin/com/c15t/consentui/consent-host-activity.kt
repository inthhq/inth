package com.c15t.consentui

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.ComposeView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Modifier
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
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

/** Optional native Activity host. The registry owns one session, never a second engine. */
object ConsentHost {
    private class Session(val id: String, val presenter: ConsentPresenter, val store: ViewModelStore,
        val privacyPolicyUrl: String, var owner: WeakReference<Any>, var outcome: ((ConsentHostOutcome) -> Unit)?, val notice: Boolean,
        val preferences: Boolean) {
        /** What the session shows. */
        val presentation get() = if (preferences) ConsentHostPresentation.PREFERENCES else ConsentHostPresentation.PROMPT
        /** Whether anything of this session is on screen or still saving. */
        val showing get() = presenter.presentationID != null || presenter.noticeVisible || presenter.pending
        var activity = WeakReference<ConsentHostActivity>(null)
        var launching = true
        var noticeView = WeakReference<ComposeView>(null)
        var noticeActivity = WeakReference<Activity>(null)
        var noticeApplication: Application? = null
        var noticeLifecycle: Application.ActivityLifecycleCallbacks? = null
    }
    /** The session last opened. Read it through [current], which never returns one that shows nothing. */
    private var held: Session? = null

    /**
     * The open session, derived from what is on screen: a held session that shows nothing (its
     * notice was cleared by `dismissNotice()` or a reset, with no decision to close it) is ended
     * here with a dismissed outcome, so no request is ever answered with a session that is not
     * visible.
     */
    private fun current(): Session? {
        held?.takeIf { !it.showing }?.presenter?.onOutcome?.invoke(ConsentPresenterOutcome.DISMISSED)
        return held
    }
    private const val NOTICE_SESSION_STATE = "com.c15t.consentui.notice.session"

    /**
     * Call on the main thread. Repeated requests reuse the current session and its draft.
     *
     * @param outcome Receives how the session ended, once. A repeated request replaces it.
     * @returns Whether a session opened, was already open, or was not needed.
     */
    fun present(activity: Activity, core: ConsentCore, preferences: Boolean, privacyPolicyUrl: String, owner: Any = activity, outcome: (ConsentHostOutcome) -> Unit): ConsentHostSession {
        val uri = android.net.Uri.parse(privacyPolicyUrl)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank()) { "An HTTPS privacy-policy URL is required" }
        // A repeated prompt request re-asks the open session, so a notice cleared and owed again shows.
        held?.takeIf { !preferences }?.presenter?.presentPrompt()
        current()?.let {
            it.owner = WeakReference(owner)
            it.outcome = outcome
            if (it.notice) {
                attachNotice(activity, it)
                return ConsentHostSession.AlreadyPresented(it.id, it.presentation)
            }
            val host = it.activity.get()
            if (!it.launching && (host == null || host.isFinishing || host.isDestroyed)) {
                it.launching = true
                try {
                    activity.startActivity(Intent(activity, ConsentHostActivity::class.java).putExtra("c15t.session", it.id))
                } catch (error: Exception) {
                    it.launching = false
                    throw error
                }
            }
            return ConsentHostSession.AlreadyPresented(it.id, it.presentation)
        }
        val snapshot = core.snapshot()
        if (!preferences && (snapshot.policyPending || !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice))
            return ConsentHostSession.NotRequired
        val store = ViewModelStore()
        val presenter = ViewModelProvider(store, object : ViewModelProvider.Factory {
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return ConsentPresenter(core, autoPresent = false) as T
            }
        })[ConsentPresenter::class.java]
        if (preferences) presenter.presentPreferences() else presenter.presentPrompt()
        val id = presenter.presentationID ?: UUID.randomUUID().toString()
        val session = Session(id, presenter, store, privacyPolicyUrl, WeakReference(owner), outcome,
            !preferences && snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge, preferences)
        held = session
        presenter.onOutcome = { value ->
            if (held === session) {
                val snapshot = core.snapshot()
                val result = when {
                    value == ConsentPresenterOutcome.DISMISSED && snapshot.policyPending -> ConsentHostOutcome.Unavailable(id, snapshot.revision)
                    value == ConsentPresenterOutcome.DISMISSED -> ConsentHostOutcome.Dismissed(id, snapshot.revision)
                    session.notice && !presenter.preferences -> ConsentHostOutcome.Acknowledged(id, snapshot.revision)
                    else -> ConsentHostOutcome.Committed(id, snapshot.revision)
                }
                held = null
                releaseNotice(session)
                session.activity.get()?.finish()
                session.outcome?.invoke(result)
                session.outcome = null
                store.clear()
            }
        }
        // A notice cleared outside this session (`dismissNotice()`, a reset) leaves it showing
        // nothing and with no decision to close it: end it, so its outcome reaches JavaScript.
        presenter.viewModelScope.launch {
            snapshotFlow { session.showing }.collect { showing ->
                if (!showing && held === session) presenter.onOutcome?.invoke(ConsentPresenterOutcome.DISMISSED)
            }
        }
        try {
            if (session.notice) attachNotice(activity, session)
            else activity.startActivity(Intent(activity, ConsentHostActivity::class.java).putExtra("c15t.session", id))
        } catch (error: Exception) {
            held = null
            releaseNotice(session)
            presenter.onOutcome = null
            store.clear()
            throw error
        }
        return ConsentHostSession.Presented(id, session.presentation)
    }
    fun close(sessionID: String) { current()?.takeIf { it.id == sessionID }?.presenter?.requestClose() }
    /** Detach a torn-down JS runtime without cancelling native durable work. */
    fun detach(owner: Any) { held?.takeIf { it.owner.get() === owner }?.let { it.outcome = null; it.owner.clear() } }
    internal fun attach(activity: ConsentHostActivity, id: String?): Boolean {
        val session = current()?.takeIf { it.id == id } ?: return false
        session.activity = WeakReference(activity)
        session.launching = false
        activity.setContent { C15tConsent(session.presenter, session.privacyPolicyUrl) }
        return true
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
