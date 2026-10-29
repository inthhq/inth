@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.c15t.demo

import android.app.Application
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.viewmodel.compose.viewModel
import com.c15t.android.*
import com.c15t.consentui.*
import com.c15t.core.*
import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.spi.*
import com.c15t.core.store.*
import com.c15t.core.transport.*
import com.c15t.prototype.BuildConfig
import com.c15t.prototype.R
import kotlinx.coroutines.*
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean

class ConsentDemoActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val model = ViewModelProvider(this)[DemoModel::class.java]
        model.start(intent)
        setContent {
            MaterialTheme {
                val core = model.core
                if (core == null) Setup(model)
                else {
                    val presenter: ConsentPresenter = viewModel(factory = object : ViewModelProvider.Factory {
                        override fun <T : ViewModel> create(modelClass: Class<T>): T {
                            @Suppress("UNCHECKED_CAST") return ConsentPresenter(core) as T
                        }
                    })
                    Box(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                        Host(model, presenter)
                        C15tConsent(presenter, model.policyUrl, theme = if (model.fixtureTheme == "brand") PantryBrand.theme else null)
                    }
                }
            }
        }
    }
}

class DemoModel(application: Application) : AndroidViewModel(application) {
    var core by mutableStateOf<C15tKernel?>(null); private set
    var snapshot by mutableStateOf(ConsentSnapshot.denyAll()); private set
    var pending by mutableIntStateOf(0); private set
    var lastError by mutableStateOf("none"); private set
    var iabSummary by mutableStateOf("none"); private set
    var policyUrl by mutableStateOf(""); private set
    var fixture by mutableStateOf(false); private set
    /** Debug fixtures can opt into the sample brand theme; normal launches use the stock c15t appearance. */
    var fixtureTheme by mutableStateOf<String?>(null); private set
    var setupError by mutableStateOf<String?>(null); private set
    private var fixtureStore: C15tStore? = null
    var fault: FaultPreferences? = null
    var http: FixtureHttp? = null
    private var started = false
    private var reportUrl: String? = null
    private val launchId = java.util.UUID.randomUUID().toString()
    private var subscription: Subscription? = null
    private val observer: (ConsentSnapshot) -> Unit = { viewModelScope.launch { update() } }
    private val errorObserver: (KernelError) -> Unit = { e -> viewModelScope.launch { lastError = e.code; update() } }
    private var errors: Subscription? = null
    fun start(intent: Intent? = null, backend: String? = null, privacy: String? = null) {
        if (started) return
        val context = getApplication<Application>()
        val scenario = if (BuildConfig.DEBUG) intent?.getStringExtra("C15T_FIXTURE_SCENARIO") else null
        if (scenario != null) fixtureTheme = intent?.getStringExtra("C15T_FIXTURE_THEME")
        if (scenario == null && (backend.isNullOrBlank() || privacy.isNullOrBlank())) return
        if (scenario == null) {
            val url = runCatching { URI(backend!!) }.getOrNull()
            val policy = runCatching { URI(privacy!!) }.getOrNull()
            if (url?.scheme != "https" || url.host == null || policy?.scheme != "https" || policy.host == null) { setupError = "Enter an HTTPS Inth project URL and privacy policy URL."; return }
        }
        started = true
        viewModelScope.launch {
            try {
                val engine = withContext(Dispatchers.IO) {
                    if (scenario != null) {
                        fixture = true
                        val prefs = context.getSharedPreferences("prototype-$scenario", 0)
                        if (intent?.getBooleanExtra("C15T_FIXTURE_RESET", false) == true) prefs.edit().clear().commit()
                        val store = FaultPreferences(prefs)
                        val mode = if (scenario.contains("iab")) "iab" else if (scenario.contains("notice")) "notice" else "category"
                        val peer = FixtureHttp(context.assets.open("$mode-init.json").bufferedReader().use { it.readText() }, context.filesDir,
                            scenario == "fresh-offline-none" || intent?.getBooleanExtra("C15T_FIXTURE_OFFLINE", false) == true)
                        val backend = intent?.getStringExtra("C15T_FIXTURE_BACKEND")
                        if (backend != null) {
                            val uri = URI(backend)
                            require(uri.host in listOf("localhost", "127.0.0.1"))
                            reportUrl = uri.resolve("/e2e/state").toString()
                        }
                        val config = NativeConfig(portalUrl = backend ?: "https://fixture.invalid", consentCategories = ConsentCategory.entries, detectedGpc = scenario == "gpc-on",
                            iab = if (mode == "iab") IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB", publisherRestrictions = listOf(IabPublisherRestriction(7,0,listOf(2)))) else null)
                        val durableStore = C15tStore(store)
                        fixtureStore = durableStore
                        val kernel = C15tKernel(config, durableStore, transport = HostedTransport(if (backend == null) peer else C15tHttpClient(),config), executor = TaskExecutor.DIRECT)
                        kernel.bootstrap()
                        fault = store; http = peer
                        policyUrl = "https://example.test/privacy"
                        store.failNext.set(intent?.getBooleanExtra("C15T_FIXTURE_FAIL_NEXT_WRITE",false) == true)
                        kernel
                    } else {
                        val config = NativeConfig(portalUrl = backend!!, consentCategories = ConsentCategory.entries)
                        C15tAndroid.install(context, config)
                        policyUrl = privacy!!
                        requireNotNull(C15t.current)
                    }
                }
                core = engine
                subscription = engine.onChange(observer); errors = engine.onError(errorObserver)
                update()
            } catch (error: Exception) { setupError = error.message; started = false }
        }
    }
    fun update() {
        val engine = core ?: return
        snapshot = engine.snapshot()
        reportUrl?.let { url ->
            val raw = com.c15t.core.wire.SnapshotWire.encodeToString(snapshot)
            viewModelScope.launch(Dispatchers.IO) {
                val body = org.json.JSONObject().put("core", "native").put("snapshot", raw).put("session", launchId).toString()
                runCatching { C15tHttpClient().send(HttpRequest(method = HttpRequest.POST, url = url, headers = mapOf("Content-Type" to "application/json"), body = body)) }
            }
        }
        viewModelScope.launch { pending = withContext(Dispatchers.IO) { fixtureStore?.readPending()?.size ?: 0 } }
        iabSummary = engine.iabConsent?.let { "purposes=${it.choices.purposeConsents}; purposeLI=${it.choices.purposeLegitimateInterests}; purposeObjections=${it.choices.purposeObjections}; vendors=${it.choices.vendorConsents}; vendorObjections=${it.choices.vendorObjections}; ac=${it.addtlConsent}" } ?: "none"
    }
    override fun onCleared() { subscription?.close(); errors?.close() }
}

@Composable private fun Setup(model: DemoModel) {
    var backend by remember { mutableStateOf("https://example-inth.inth.app/") }; var privacy by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Connect an Inth project", style = MaterialTheme.typography.headlineSmall)
        Text("Use the example Inth project or your own project, and enter your app's privacy policy URL.")
        OutlinedTextField(backend, { backend = it }, label = { Text("Inth project URL") })
        OutlinedTextField(privacy, { privacy = it }, label = { Text("Privacy policy URL") })
        Button(onClick = { model.start(backend = backend, privacy = privacy) }) { Text("Connect") }
        model.setupError?.let { Text(it) }
    }
}
@Composable private fun Host(model: DemoModel, presenter: ConsentPresenter) {
    LazyColumn(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp).testTag("fixture.state"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Privacy demo", style = MaterialTheme.typography.headlineMedium); Text(if (model.fixture) "Local protocol fixture" else "Inth hosted project") }
        item { Button(onClick = presenter::presentPreferences, modifier = Modifier.testTag("fixture.open-preferences")) { Text("Privacy settings") } }
        if (model.fixture) {
            item { Text(if (model.snapshot.promptRequirement.acknowledge) "choice" else if (model.snapshot.promptRequirement.notice) "notice" else "none", modifier = Modifier.testTag("fixture.state.prompt")) }
            item { Text("${model.snapshot.policyPending}", modifier = Modifier.testTag("fixture.state.policy-pending")) }
            item { Text(if (model.snapshot.explicitChoice == null) "none" else "recorded", modifier = Modifier.testTag("fixture.state.explicit-choice")) }
            items(ConsentCategory.OPTIONAL.size) { i -> val c = ConsentCategory.OPTIONAL[i]; Text("${c.wireName}: ${model.snapshot.effectivePermissions[c]}", modifier = Modifier.testTag("fixture.state.permission.${c.wireName}")) }
            item { Text("${model.pending}", modifier = Modifier.testTag("fixture.state.pending-saves")) }
            item { Text(model.iabSummary, modifier = Modifier.testTag("fixture.state.iab")) }
            item { Text(model.lastError, modifier = Modifier.testTag("fixture.state.last-error")) }
            item { Button(onClick = { model.fault?.failNext?.set(true) }, modifier = Modifier.testTag("fixture.fail-next-write")) { Text("Refuse next storage write") } }
            item { Button(onClick = { model.http?.offline = false; model.core?.refresh() }, modifier = Modifier.testTag("fixture.reconnect")) { Text("Reconnect") } }
        }
    }
}

/**
 * A fictional grocery app's appearance: a teal accent on mint paper, its own mark and headline.
 * Everything here goes through the public theme.
 */
object PantryBrand {
    val theme = ConsentTheme(
        colors = ConsentTheme.Colors(
            canvas = ConsentThemeColor(0xF3FAF7, 0x0F1A17), surface = ConsentThemeColor(0xFFFFFF, 0x17241F),
            surfaceMuted = ConsentThemeColor(0xE2F1EB, 0x1F3029), text = ConsentThemeColor(0x10201C, 0xEAF4F0),
            textSecondary = ConsentThemeColor(0x5C7169, 0x9DB3AC), accent = ConsentThemeColor(0x00796B, 0x4FD1C0),
            onAccent = ConsentThemeColor(0xFFFFFF, 0x06302A), decision = ConsentThemeColor(0x00796B, 0x4FD1C0),
            onDecision = ConsentThemeColor(0xFFFFFF, 0x06302A)),
        cornerRadius = 10.dp,
        headlineFont = ConsentTheme.HeadlineFont.SansSerif,
        brand = ConsentTheme.Brand(name = "Pantry", markResId = R.drawable.consent_demo_mark),
        copy = ConsentTheme.Copy(headline = "Before you shop.", introduction = "Pantry uses data to remember your basket, measure what works and show offers you might like."),
    )
}

/** Test-only synchronous durable preferences. Failure preserves the previous durable value. */
class FaultPreferences(private val prefs: android.content.SharedPreferences) : KeyValueStore {
    val failNext = AtomicBoolean(false)
    override fun read(key: String) = prefs.getString(key,null)
    override fun write(key: String, value: String?) { writeDurably(key,value) }
    override fun writeDurably(key: String, value: String?): Boolean {
        if (failNext.compareAndSet(true,false)) return false
        return prefs.edit().apply { if (value == null) remove(key) else putString(key,value) }.commit()
    }
    override fun keys(): Set<String> = prefs.all.keys
}
/** Test-only HTTP peer. HostedTransport owns all parsing and exact decision body authoring. */
class FixtureHttp(private val body: String, private val directory: java.io.File, @Volatile var offline: Boolean) : HttpClient {
    override fun send(request: HttpRequest): HttpResponse {
        if (request.method == HttpRequest.GET) return if (offline) HttpResponse(503) else HttpResponse(200, mapOf("x-c15t-policy-contract" to "1"),body)
        request.body?.let { java.io.File(directory,"last-save.json").writeText(it) }
        return HttpResponse(503)
    }
}
