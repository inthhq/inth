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
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.c15t.core.ConsentCore
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID

/** Optional native Activity host. The registry owns one session, never a second engine. */
object ConsentHost {
    private class Session(val id: String, val presenter: ConsentPresenter, val store: ViewModelStore,
        val privacyPolicyUrl: String, var owner: WeakReference<Any>, var outcome: ((String) -> Unit)?, val notice: Boolean) {
        var activity = WeakReference<ConsentHostActivity>(null)
        var launching = true
        var noticeView = WeakReference<ComposeView>(null)
        var noticeActivity = WeakReference<Activity>(null)
        var noticeApplication: Application? = null
        var noticeLifecycle: Application.ActivityLifecycleCallbacks? = null
    }
    private var active: Session? = null
    private const val NOTICE_SESSION_STATE = "com.c15t.consentui.notice.session"

    /** Call on the main thread. Repeated requests reuse the current session and its draft. */
    fun present(activity: Activity, core: ConsentCore, preferences: Boolean, privacyPolicyUrl: String, owner: Any = activity, outcome: (String) -> Unit): String {
        val uri = android.net.Uri.parse(privacyPolicyUrl)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank()) { "An HTTPS privacy-policy URL is required" }
        active?.let {
            it.owner = WeakReference(owner)
            it.outcome = outcome
            if (it.notice) {
                attachNotice(activity, it)
                return result(it.id, "already-presented")
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
            return result(it.id, "already-presented")
        }
        val snapshot = core.snapshot()
        if (!preferences && (snapshot.policyPending || !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice))
            return JSONObject().put("sessionId", JSONObject.NULL).put("status", "not-required").toString()
        val store = ViewModelStore()
        val presenter = ViewModelProvider(store, object : ViewModelProvider.Factory {
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return ConsentPresenter(core, autoPresent = false) as T
            }
        })[ConsentPresenter::class.java]
        if (preferences) presenter.presentPreferences() else presenter.presentPrompt()
        val id = presenter.presentationID ?: UUID.randomUUID().toString()
        val session = Session(id, presenter, store, privacyPolicyUrl, WeakReference(owner), outcome, !preferences && snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge)
        active = session
        presenter.onOutcome = { value ->
            if (active === session) {
                val payload = JSONObject().put("sessionId", id).put("revision", core.snapshot().revision)
                    .put("kind", if (value == ConsentPresenterOutcome.DISMISSED) { if (core.snapshot().policyPending) "unavailable" else "dismissed" }
                        else if (session.notice && !presenter.preferences) "acknowledged" else "committed").toString()
                active = null
                releaseNotice(session)
                session.activity.get()?.finish()
                session.outcome?.invoke(payload)
                session.outcome = null
                store.clear()
            }
        }
        try {
            if (session.notice) attachNotice(activity, session)
            else activity.startActivity(Intent(activity, ConsentHostActivity::class.java).putExtra("c15t.session", id))
        } catch (error: Exception) {
            active = null
            releaseNotice(session)
            presenter.onOutcome = null
            store.clear()
            throw error
        }
        return result(id, "presented")
    }
    fun close(sessionID: String) { active?.takeIf { it.id == sessionID }?.presenter?.requestClose() }
    /** Detach a torn-down JS runtime without cancelling native durable work. */
    fun detach(owner: Any) { active?.takeIf { it.owner.get() === owner }?.let { it.outcome = null; it.owner.clear() } }
    internal fun attach(activity: ConsentHostActivity, id: String?): Boolean {
        val session = active?.takeIf { it.id == id } ?: return false
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
                if (active === session && savedInstanceState?.getString(NOTICE_SESSION_STATE) == session.id) {
                    session.noticeActivity = WeakReference(activity)
                }
            }
            override fun onActivityResumed(activity: Activity) {
                if (active === session && session.noticeActivity.get() === activity) attachNotice(activity, session)
            }
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {
                if (active === session && session.noticeActivity.get() === activity) {
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
    private fun result(id: String, status: String) = JSONObject().put("sessionId", id).put("status", status).toString()
}

/** Shares drafts and pending work across configuration changes. No exported launch entry. */
class ConsentHostActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!ConsentHost.attach(this, intent.getStringExtra("c15t.session"))) finish()
    }
}
