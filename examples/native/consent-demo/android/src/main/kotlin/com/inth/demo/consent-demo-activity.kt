@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.inth.demo

import android.app.Application
import android.content.ClipData
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.*
import com.inth.android.*
import com.inth.consentui.*
import com.inth.core.*
import com.inth.core.iab.*
import com.inth.core.model.*
import com.inth.core.spi.*
import com.inth.core.store.*
import com.inth.core.transport.*
import com.inth.prototype.BuildConfig
import com.inth.prototype.R
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
                else if (model.consentPresentationDeferred) ReviewDiagnostics(model, onClose = model::showConsentScreen)
                else {
                    // The app-wide prompt the one-line composable attaches to, so the journeys run
                    // the default auto-present path.
                    val prompt = remember(core) { ConsentPrompt.of(core) }
                    val ledger = remember(core) { LedgerConsentState() }
                    Box(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                        Host(model, openPreferences = { if (model.customUi) ledger.preferencesOpen = true else prompt.presentPreferences() })
                        // The app's own consent UI on the headless blocks, in place of the stock screens.
                        if (model.customUi) { LedgerConsent(core, model.policyUrl, ledger); return@Box }
                        val theme = if (model.fixtureTheme == "brand") PantryBrand.theme else null
                        val providerTheme = when (model.fixtureBranding) {
                            "c15t" -> (theme ?: ConsentTheme.default).copy(branding = ConsentTheme.Branding.C15t)
                            "inth" -> (theme ?: ConsentTheme.default).copy(branding = ConsentTheme.Branding.Inth)
                            "custom" -> (theme ?: ConsentTheme.default).copy(branding = ConsentTheme.Branding.Custom("Pantry", R.drawable.consent_demo_mark))
                            "hidden" -> (theme ?: ConsentTheme.default).copy(showsBranding = false)
                            else -> theme
                        }
                        val identityTheme = when (model.fixtureIdentity) {
                            // A mark resource that cannot draw exercises the initial tile.
                            "generic" -> (providerTheme ?: ConsentTheme.default).copy(brand = ConsentTheme.Brand(markResId = 0))
                            "hidden" -> (providerTheme ?: ConsentTheme.default).copy(brand = ConsentTheme.Brand.Hidden)
                            else -> providerTheme
                        }
                        InthConsent(model.policyUrl, theme = remember(identityTheme) { demoLayout(identityTheme) }, core = core)
                    }
                }
            }
        }
    }

    /**
     * Debug builds can try each first-layer layout, appearance and Save position in any mode without a rebuild:
     * `adb shell am start -n <package>/com.inth.demo.ConsentDemoActivity --es INTH_DEMO_FIRST_LAYER sheet --es INTH_DEMO_APPEARANCE system --es INTH_DEMO_SAVE_PLACEMENT top`.
     */
    private fun demoLayout(theme: ConsentTheme?): ConsentTheme? = demoName(demoOptions(fixtureLayout(theme)))

    /** The journeys check the paper page and its footer Save. `stock` runs one on the theme a normal launch gets. */
    private fun fixtureLayout(theme: ConsentTheme?): ConsentTheme? {
        if (!BuildConfig.DEBUG || intent?.getStringExtra("INTH_FIXTURE_SCENARIO") == null) return theme
        if (intent?.getStringExtra("INTH_FIXTURE_THEME") == "stock") return theme
        return (theme ?: ConsentTheme.default).copy(appearance = ConsentTheme.Appearance.Paper, savePlacement = ConsentTheme.SavePlacement.Bottom)
    }

    /** Outside the Debug fixtures the demo names itself above the headline, as a real app would. */
    private fun demoName(theme: ConsentTheme?): ConsentTheme? {
        if (BuildConfig.DEBUG && intent?.getStringExtra("INTH_FIXTURE_SCENARIO") != null) return theme
        val base = theme ?: ConsentTheme.resolve(this)
        return if (base.brand.name == null) base.copy(brand = base.brand.copy(name = "Inth Demo")) else base
    }

    private fun demoOptions(theme: ConsentTheme?): ConsentTheme? {
        if (!BuildConfig.DEBUG) return theme
        val layout = intent?.getStringExtra("INTH_DEMO_FIRST_LAYER")?.trim()?.let { value -> ConsentTheme.FirstLayer.entries.firstOrNull { it.name.equals(value, ignoreCase = true) } }
        val appearance = intent?.getStringExtra("INTH_DEMO_APPEARANCE")?.trim()?.let { value -> ConsentTheme.Appearance.entries.firstOrNull { it.name.equals(value, ignoreCase = true) } }
        val placement = intent?.getStringExtra("INTH_DEMO_SAVE_PLACEMENT")?.trim()?.let { value -> ConsentTheme.SavePlacement.entries.firstOrNull { it.name.equals(value, ignoreCase = true) } }
        if (layout == null && appearance == null && placement == null) return theme
        val base = theme ?: ConsentTheme.resolve(this)
        return base.copy(firstLayer = layout ?: base.firstLayer, appearance = appearance ?: base.appearance, savePlacement = placement ?: base.savePlacement)
    }
}

class DemoModel(application: Application) : AndroidViewModel(application) {
    var core by mutableStateOf<ConsentCore?>(null); private set
    var snapshot by mutableStateOf(ConsentSnapshot.denyAll()); private set
    var pending by mutableIntStateOf(0); private set
    var lastError by mutableStateOf("none"); private set
    var iabSummary by mutableStateOf("none"); private set
    var policyUrl by mutableStateOf(""); private set
    var fixture by mutableStateOf(false); private set
    /** Debug fixtures can opt into the sample brand theme; normal launches use the stock c15t appearance. */
    var fixtureTheme by mutableStateOf<String?>(null); private set
    var fixtureBranding by mutableStateOf<String?>(null); private set
    var fixtureIdentity by mutableStateOf<String?>(null); private set
    /** Draw consent with the app's own screens (`custom-consent-ui.kt`) instead of the stock ones. */
    var customUi by mutableStateOf(false)
    var setupError by mutableStateOf<String?>(null); private set
    /** Debug launches can bind real vendor SDKs to the fixture core. */
    var vendorProbe by mutableStateOf<VendorProbe?>(null); private set
    var vendorProbes by mutableIntStateOf(0); private set
    private var reviewCapture by mutableStateOf<TcfReviewCapture?>(null)
    val reviewReport: String get() = reviewCapture?.text ?: ""
    val reviewReportJson: String get() = reviewCapture?.json ?: ""
    var reviewing by mutableStateOf(false); private set
    var reviewSetupSaved by mutableStateOf(false); private set
    var showReviewDiagnostics by mutableStateOf(false); private set
    var consentPresentationDeferred by mutableStateOf(false); private set
    private var reviewProfile: TcfReviewProfile? = null
    private var fixtureStore: InthStore? = null
    var fault: FaultPreferences? = null
    var http: FixtureHttp? = null
    private var started = false
    private var reportUrl: String? = null
    private val launchId = java.util.UUID.randomUUID().toString()
    private var subscription: Subscription? = null
    private val observer: (ConsentSnapshot) -> Unit = { viewModelScope.launch { update() } }
    private val errorObserver: (KernelError) -> Unit = { e -> viewModelScope.launch { lastError = e.code; update() } }
    private var errors: Subscription? = null
    internal fun start(intent: Intent? = null, backend: String? = null, privacy: String? = null, review: TcfReviewProfile? = null, inspectBeforeConsent: Boolean = false) {
        if (started) return
        val context = getApplication<Application>()
        val scenario = if (BuildConfig.DEBUG) intent?.getStringExtra("INTH_FIXTURE_SCENARIO") else null
        val profile = try {
            review ?: if (scenario == null && backend == null && privacy == null) TcfReviewProfile.restore(reviewPreferences().all) else null
        } catch (error: IllegalArgumentException) {
            setupError = error.message; return
        } catch (error: IllegalStateException) {
            setupError = error.message; return
        }
        val hostedBackend = profile?.backend ?: backend
        val hostedPrivacy = profile?.privacy ?: privacy
        if (scenario != null) {
            fixtureTheme = intent?.getStringExtra("INTH_FIXTURE_THEME")
            fixtureBranding = intent?.getStringExtra("INTH_FIXTURE_BRANDING")
            fixtureIdentity = intent?.getStringExtra("INTH_FIXTURE_IDENTITY")
            if (intent?.getStringExtra("INTH_FIXTURE_UI") == "custom") customUi = true
        }
        if (scenario == null && (hostedBackend.isNullOrBlank() || hostedPrivacy.isNullOrBlank())) return
        if (scenario == null) {
            val url = runCatching { URI(hostedBackend!!) }.getOrNull()
            val policy = runCatching { URI(hostedPrivacy!!) }.getOrNull()
            if (url?.scheme != "https" || url.host == null || policy?.scheme != "https" || policy.host == null) { setupError = "Enter an HTTPS Inth project URL and privacy policy URL."; return }
        }
        setupError = null
        started = true
        viewModelScope.launch {
            try {
                val engine = withContext(Dispatchers.IO) {
                    if (scenario != null) {
                        fixture = true
                        val prefs = context.getSharedPreferences("prototype-$scenario", 0)
                        if (intent?.getBooleanExtra("INTH_FIXTURE_RESET", false) == true) prefs.edit().clear().commit()
                        val store = FaultPreferences(prefs)
                        val mode = if (scenario.contains("iab")) "iab" else if (scenario.contains("notice")) "notice" else "category"
                        val peer = FixtureHttp(context.assets.open("$mode-init.json").bufferedReader().use { it.readText() }, context.filesDir,
                            scenario == "fresh-offline-none" || intent?.getBooleanExtra("INTH_FIXTURE_OFFLINE", false) == true)
                        val backend = intent?.getStringExtra("INTH_FIXTURE_BACKEND")
                        if (backend != null) {
                            val uri = URI(backend)
                            require(uri.host in listOf("localhost", "127.0.0.1"))
                            reportUrl = uri.resolve("/e2e/state").toString()
                        }
                        val config = NativeConfig(backendUrl = backend ?: "https://fixture.invalid", consentCategories = ConsentCategory.entries, detectedGpc = scenario == "gpc-on",
                            iab = if (mode == "iab") IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB", publisherRestrictions = listOf(IabPublisherRestriction(7,0,listOf(2)))) else null)
                        val durableStore = InthStore(store)
                        fixtureStore = durableStore
                        val kernel = ConsentCore(config, durableStore, transport = HostedTransport(if (backend == null) peer else InthHttpClient(),config), executor = TaskExecutor.DIRECT)
                        kernel.bootstrap()
                        fault = store; http = peer
                        policyUrl = "https://example.test/privacy"
                        store.failNext.set(intent?.getBooleanExtra("INTH_FIXTURE_FAIL_NEXT_WRITE",false) == true)
                        val vendors = VendorSdkRequest(
                            intent?.getStringExtra(VendorSdkRequest.CAPTURE_EXTRA),
                            intent?.getBooleanExtra(VendorSdkRequest.FIREBASE_EXTRA, false) == true,
                            PostHogLive.from(intent?.getStringExtra(VendorSdkRequest.POSTHOG_LIVE_HOST_EXTRA), intent?.getStringExtra(VendorSdkRequest.POSTHOG_LIVE_KEY_EXTRA), intent?.getStringExtra(VendorSdkRequest.POSTHOG_LIVE_RUN_ID_EXTRA)),
                        )
                        vendorProbe = connectVendorSdks(context, kernel, vendors) { e -> viewModelScope.launch { lastError = "vendor: ${e.message}" } }
                        kernel
                    } else {
                        val config = profile?.nativeConfig() ?: NativeConfig(backendUrl = hostedBackend!!, consentCategories = ConsentCategory.entries)
                        InthAndroid.install(context, config)
                        policyUrl = hostedPrivacy!!
                        if (profile != null) {
                            reviewSetupSaved = reviewPreferences().edit().apply {
                                clear()
                                profile.storedValues().forEach { (key, value) -> putString(key, value) }
                            }.commit()
                        }
                        requireNotNull(Inth.current)
                    }
                }
                core = engine
                reviewProfile = profile
                reviewing = profile != null
                consentPresentationDeferred = profile != null && inspectBeforeConsent
                if (consentPresentationDeferred) openReviewDiagnostics()
                subscription = engine.onChange(observer); errors = engine.onError(errorObserver)
                update()
            } catch (error: Exception) { setupError = error.message; started = false }
        }
    }
    fun update() {
        val engine = core ?: return
        snapshot = engine.snapshot()
        reportUrl?.let { url ->
            val raw = com.inth.core.wire.SnapshotWire.encodeToString(snapshot)
            viewModelScope.launch(Dispatchers.IO) {
                val body = org.json.JSONObject().put("core", "native").put("snapshot", raw).put("session", launchId).toString()
                runCatching { InthHttpClient().send(HttpRequest(method = HttpRequest.POST, url = url, headers = mapOf("Content-Type" to "application/json"), body = body)) }
            }
        }
        viewModelScope.launch { pending = withContext(Dispatchers.IO) { fixtureStore?.readPending()?.size ?: 0 } }
        iabSummary = engine.iabConsent?.let { "purposes=${it.choices.purposeConsents}; purposeLI=${it.choices.purposeLegitimateInterests}; purposeObjections=${it.choices.purposeObjections}; vendors=${it.choices.vendorConsents}; vendorObjections=${it.choices.vendorObjections}; ac=${it.addtlConsent}" } ?: "none"
    }
    fun connectReview(backend: String, privacy: String, cmpId: String, cmpVersion: String, country: String, vendors: String, inspectBeforeConsent: Boolean) {
        try {
            start(review = TcfReviewProfile.parse(backend, privacy, cmpId, cmpVersion, country, vendors), inspectBeforeConsent = inspectBeforeConsent)
        } catch (error: IllegalArgumentException) { setupError = error.message }
    }
    @Suppress("DEPRECATION")
    fun refreshReviewReport() {
        val profile = reviewProfile ?: return
        val engine = core ?: return
        val capturedAt = System.currentTimeMillis()
        val currentSnapshot = engine.snapshot()
        val authority = engine.iabConsent
        val listStatus = engine.iabStatus().availability
        val acStatus = engine.additionalConsentStatus()
        val providers = engine.adTechProviderDisclosures()
        val platformValues = android.preference.PreferenceManager.getDefaultSharedPreferences(getApplication<Application>()).all
        reviewCapture = captureTcfReview(profile,
            TcfReviewBuild(BuildConfig.APPLICATION_ID, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE.toString(), BuildConfig.BUILD_TYPE, InthProtocol.DEFAULT_SDK_VERSION),
            currentSnapshot, authority, listStatus, acStatus, providers, platformValues,
            capturedAt, lastError)
    }
    fun resetReviewConsent() {
        if (!reviewing) return
        viewModelScope.launch {
            withContext(Dispatchers.IO) { core?.reset() }
            update()
            refreshReviewReport()
        }
    }
    fun forgetReviewSetup() {
        viewModelScope.launch {
            val cleared = withContext(Dispatchers.IO) { reviewPreferences().edit().clear().commit() }
            if (cleared) reviewSetupSaved = false
            else setupError = "The saved review setup could not be removed."
        }
    }
    fun openReviewDiagnostics() {
        refreshReviewReport()
        showReviewDiagnostics = true
    }
    fun showConsentScreen() {
        consentPresentationDeferred = false
        showReviewDiagnostics = false
    }
    /** Send one probe event through every wired vendor SDK and flush it. */
    fun probeVendors() {
        val probe = vendorProbe ?: return
        viewModelScope.launch {
            withContext(Dispatchers.IO) { probe.probe("probe-${vendorProbes + 1}") }
            vendorProbes++
        }
    }
    private fun reviewPreferences() = getApplication<Application>().getSharedPreferences("inth.tcf-review-setup", 0)
    override fun onCleared() { subscription?.close(); errors?.close(); vendorProbe?.close() }
}

@Composable private fun Setup(model: DemoModel) {
    var backend by remember { mutableStateOf("https://example-inth.inth.app/") }; var privacy by remember { mutableStateOf("") }
    var review by remember { mutableStateOf(false) }
    var cmpId by remember { mutableStateOf("") }; var cmpVersion by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("") }; var vendors by remember { mutableStateOf("") }
    var inspectBeforeConsent by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Connect an Inth project", style = MaterialTheme.typography.headlineSmall)
        Text("Use the example Inth project or your own project, and enter your app's privacy policy URL.")
        OutlinedTextField(backend, { backend = it }, label = { Text("Inth project URL") })
        OutlinedTextField(privacy, { privacy = it }, label = { Text("Privacy policy URL") })
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text("Hosted IAB TCF review", modifier = Modifier.weight(1f))
            Switch(checked = review, onCheckedChange = { review = it }, modifier = Modifier.testTag("review.mode").semantics { contentDescription = "Hosted IAB TCF review" })
        }
        if (review) {
            Text("Use the CMP identity assigned for this review and an Inth project that serves an IAB policy. This app checks field ranges, not registration or certification. Setup is saved in this app for process-restart checks.")
            OutlinedTextField(cmpId, { cmpId = it }, label = { Text("Assigned CMP ID") }, modifier = Modifier.testTag("review.cmp-id"))
            OutlinedTextField(cmpVersion, { cmpVersion = it }, label = { Text("Internal CMP version") }, modifier = Modifier.testTag("review.cmp-version"))
            OutlinedTextField(country, { country = it }, label = { Text("Publisher country, uppercase") }, modifier = Modifier.testTag("review.country"))
            OutlinedTextField(vendors, { vendors = it }, label = { Text("Vendor IDs, optional comma-separated scope") })
            Text("An empty vendor scope uses the entire list served by the project. Consent language is EN.")
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("Inspect before showing consent", modifier = Modifier.weight(1f))
                Switch(checked = inspectBeforeConsent, onCheckedChange = { inspectBeforeConsent = it }, modifier = Modifier.testTag("review.inspect-first").semantics { contentDescription = "Inspect before showing consent" })
            }
            Text("Inspection starts the same native core and reads its platform signals. The consent screen waits for Show consent screen. No choice is made by this option.")
        }
        Button(onClick = {
            if (review) model.connectReview(backend, privacy, cmpId, cmpVersion, country, vendors, inspectBeforeConsent)
            else model.start(backend = backend, privacy = privacy)
        }) { Text("Connect") }
        TextButton(onClick = model::forgetReviewSetup) { Text("Forget saved review setup") }
        if (BuildConfig.DEBUG) {
            Text("Local policy fixtures", style = MaterialTheme.typography.titleMedium)
            Text("No hosted project is contacted. IAB uses a test CMP identity and sample disclosures. Restart the app to choose another mode.")
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("Custom consent UI (headless blocks)", modifier = Modifier.weight(1f))
                Switch(checked = model.customUi, onCheckedChange = { model.customUi = it }, modifier = Modifier.testTag("demo.custom-ui").semantics { contentDescription = "Custom consent UI" })
            }
            listOf("category", "notice", "iab").forEach { mode ->
                Button(onClick = {
                    model.start(Intent().putExtra("INTH_FIXTURE_SCENARIO", "demo-$mode"))
                }, modifier = Modifier.testTag("demo.mode.$mode")) {
                    Text(if (mode == "iab") "IAB TCF and Additional Consent" else mode.replaceFirstChar { it.uppercase() })
                }
            }
        }
        model.setupError?.let { Text(it) }
    }
}
@Composable private fun Host(model: DemoModel, openPreferences: () -> Unit) {
    if (model.showReviewDiagnostics) {
        ReviewDiagnostics(model, onClose = model::showConsentScreen)
    } else {
        LazyColumn(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp).testTag("fixture.state"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Text("Privacy demo", style = MaterialTheme.typography.headlineMedium); Text(if (model.fixture) "Local protocol fixture" else "Inth hosted project") }
            item { Button(onClick = openPreferences, modifier = Modifier.testTag("fixture.open-preferences")) { Text("Privacy settings") } }
            if (model.reviewing) {
                item { Text("Hosted IAB TCF review. This is a preparation app, not a certification result.") }
                if (model.snapshot.ready && !model.snapshot.policyPending && model.snapshot.model != ConsentModel.IAB) {
                    item { Text("The project resolved ${model.snapshot.model}, not an IAB policy. Configure the project's IAB policy before review.", color = MaterialTheme.colorScheme.error) }
                }
                item { Button(onClick = model::openReviewDiagnostics, modifier = Modifier.testTag("review.diagnostics")) { Text("TCF review diagnostics") } }
            }
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
                model.vendorProbe?.let { probe ->
                    item { Button(onClick = model::probeVendors, modifier = Modifier.testTag("fixture.vendor-probe")) { Text("Send vendor probe") } }
                    item { Text("${probe.vendors.joinToString()}: ${model.vendorProbes} probes sent", modifier = Modifier.testTag("fixture.vendor-probe.status")) }
                }
            }
        }
    }
}

@Composable private fun ReviewDiagnostics(model: DemoModel, onClose: () -> Unit) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var confirmReset by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("TCF review diagnostics", style = MaterialTheme.typography.headlineSmall)
        Text("Core, disclosure status and platform storage are separate reads. Refresh after each decision. Text and JSON copy the same observation, including TC and AC strings, but no subject ID, external ID or receipt.")
        Button(onClick = onClose) { Text(if (model.consentPresentationDeferred) "Show consent screen" else "Back to demo") }
        Button(onClick = model::refreshReviewReport) { Text("Refresh report") }
        Button(onClick = { scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Inth TCF review", model.reviewReport))) } }) { Text("Copy report") }
        Button(onClick = { scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Inth mobile evidence JSON", model.reviewReportJson))) } }, modifier = Modifier.testTag("review.copy-json")) { Text("Copy JSON") }
        Button(onClick = { confirmReset = true }) { Text("Reset consent") }
        Text(if (model.reviewSetupSaved) "Review setup reconnects on relaunch." else "Review setup is not saved. Enter it again after relaunch.")
        TextButton(onClick = model::forgetReviewSetup) { Text("Forget setup for next launch") }
        model.setupError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        SelectionContainer { Text(model.reviewReport, modifier = Modifier.testTag("review.report"), style = MaterialTheme.typography.bodySmall) }
    }
    if (confirmReset) AlertDialog(
        onDismissRequest = { confirmReset = false },
        title = { Text("Reset consent for this app?") },
        text = { Text("This clears the current consent and refreshes the policy. The subject identity and saved review setup remain. It creates no new consent choice and is not a substitute for withdrawal.") },
        confirmButton = { TextButton(onClick = { confirmReset = false; model.resetReviewConsent() }) { Text("Reset consent") } },
        dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
    )
}

/**
 * A fictional grocery app's appearance: a teal primary on mint paper, roomier spacing, a larger
 * type scale, pill decisions, and its own mark and headline. Everything here goes through the
 * public theme.
 */
object PantryBrand {
    val theme = ConsentTheme(
        colors = ConsentTheme.Colors(
            canvas = ConsentThemeColor(0xF3FAF7, 0x0F1A17), surface = ConsentThemeColor(0xFFFFFF, 0x17241F),
            surfaceMuted = ConsentThemeColor(0xE2F1EB, 0x1F3029), text = ConsentThemeColor(0x10201C, 0xEAF4F0),
            textMuted = ConsentThemeColor(0x5C7169, 0x9DB3AC), primary = ConsentThemeColor(0x00796B, 0x4FD1C0),
            textOnPrimary = ConsentThemeColor(0xFFFFFF, 0x06302A), decision = ConsentThemeColor(0x00796B, 0x4FD1C0),
            textOnDecision = ConsentThemeColor(0xFFFFFF, 0x06302A)),
        radius = ConsentTheme.Radius(md = 10.dp),
        spacing = ConsentTheme.Spacing(md = 20.dp, lg = 28.dp),
        typography = ConsentTheme.Typography(fontSize = ConsentTheme.FontSize(sm = 15.sp, base = 18.sp)),
        slots = mapOf(ConsentTheme.Slot.ButtonPrimary to ConsentTheme.SlotStyle(borderRadius = 26.dp)),
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
        if (request.method == HttpRequest.GET) return if (offline) HttpResponse(503) else HttpResponse(200, emptyMap(), body)
        request.body?.let { java.io.File(directory,"last-save.json").writeText(it) }
        return HttpResponse(503)
    }
}
