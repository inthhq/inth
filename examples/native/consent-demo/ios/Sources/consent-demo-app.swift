// The Debug fixture scenarios inject an HTTP peer and a fault store, which is the
// SDK's internal API. An app imports these modules plainly and passes a project URL.
@_spi(C15tInternal) import C15tApple
@_spi(C15tInternal) import C15tCore
import C15tConsentUI
import SwiftUI

struct ConsentDemoContent: View {
    @StateObject private var session = DemoSession()
    var body: some View {
        DemoRoot(session: session).task { await session.start() }
            .preferredColorScheme(fixtureAppearance)
    }
    private var fixtureAppearance: ColorScheme? {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        if env["C15T_FIXTURE_SCENARIO"] != nil, env["C15T_FIXTURE_APPEARANCE"] == "dark" { return .dark }
        #endif
        return nil
    }
}

@MainActor
final class DemoSession: ObservableObject {
    @Published var prompt: ConsentPrompt?
    @Published var snapshot = ConsentSnapshot.coldStart
    @Published var pendingSaves = 0
    @Published var setupError: String?
    @Published var lastError = "none"
    @Published var commitCount = 0
    @Published var iabSummary = "none"
    var store: FaultStore?
    var transport: FixtureHTTP?
    var policyURL: URL?
    private var observer: ConsentSubscription?
    private var events: Task<Void, Never>?
    private var started = false
    private var reportURL: URL?
    private let launchID = UUID().uuidString
    #if DEBUG
    private var vendors: VendorSDKHarness?
    #endif
    @Published private(set) var fixture = false
    @Published private(set) var starting = false
    @Published private(set) var reviewProfile: IABReviewProfile?
    @Published private(set) var reviewReport = ""
    @Published private(set) var reviewJSON = ""
    @Published private(set) var resettingReview = false
    @Published private(set) var reviewReconnect = false
    @Published private(set) var consentUIEnabled = true

    /// Debug builds only: `C15T_DEMO_DRY_RUN=1` drops consent records and lets the
    /// project URL be any https host. A release build refuses dryRun.
    nonisolated static var dryRun: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.environment["C15T_DEMO_DRY_RUN"] == "1"
        #else
        return false
        #endif
    }

    func start(url: String? = nil, policy: String? = nil, localScenario: String? = nil, review: IABReviewProfile? = nil, inspectBeforeShowingConsent: Bool = false) async {
        guard !started && !starting else { return }
        starting = true
        setupError = nil
        defer { starting = false }
        let env = ProcessInfo.processInfo.environment
        let dryRun = Self.dryRun
        do {
            let core: ConsentCore
            if let scenario = localScenario ?? env["C15T_FIXTURE_SCENARIO"] {
                #if DEBUG
                fixture = true
                let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("prototype-" + scenario)
                if env["C15T_FIXTURE_RESET"] == "1" { try await Task.detached { if FileManager.default.fileExists(atPath: folder.path) { try FileManager.default.removeItem(at: folder) } }.value }
                let fault = await Task.detached { FaultStore(base: FileStore(directory: folder)) }.value
                let mode = scenario.contains("iab") ? "iab" : scenario.contains("notice") ? "notice" : "category"
                guard let resource = Bundle.main.url(forResource: mode + "-init", withExtension: "json") else { throw DemoError.missingFixture }
                let fixtureData = try await Task.detached { try Data(contentsOf: resource) }.value
                let http = FixtureHTTP(body: fixtureData, offline: scenario == "fresh-offline-none" || env["C15T_FIXTURE_OFFLINE"] == "1")
                let backend = env["C15T_FIXTURE_BACKEND"].flatMap(URL.init(string:))
                if let backend {
                    guard ["localhost", "127.0.0.1"].contains(backend.host ?? "") else { throw DemoError.missingFixture }
                    reportURL = URL(string: "/e2e/state", relativeTo: backend)?.absoluteURL
                }
                let peer: any HTTPTransport = backend == nil ? http : URLSession.shared
                let config = CoreConfig(store: fault,
                    transport: HostedTransport(baseURL: backend ?? URL(string: "https://fixture.invalid")!, client: peer),
                    consentCategories: [.necessary, .functionality, .experience, .measurement, .marketing],
                    iab: mode == "iab" ? IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB",
                        publisherRestrictions: [IABPublisherRestriction(purposeId: 7, type: 0, vendorIds: [2])]) : nil,
                    gpc: scenario == "gpc-on", initRetry: .disabled)
                core = try await Task.detached { try C15tApple.install(config) }.value
                await core.waitUntilIdle()
                self.store = fault
                self.transport = http
                self.policyURL = URL(string: "https://example.test/privacy")
                fault.failNext = env["C15T_FIXTURE_FAIL_NEXT_WRITE"] == "1"
                // Real vendor SDKs start only when run-vendor-e2e.sh passes its capture server.
                if let vendors = VendorSDKHarness.fromEnvironment() {
                    vendors.start(core: core)
                    self.vendors = vendors
                }
                #else
                throw DemoError.missingFixture
                #endif
            } else {
                let savedReview = url == nil && policy == nil ? IABReviewProfile.load() : nil
                if let review = review ?? savedReview {
                    let service = (Bundle.main.bundleIdentifier ?? "com.c15t.prototype.consent") + ".iab-review"
                    core = try await Task.detached {
                        try C15tApple.install(C15tAppleConfiguration(
                            backendURL: review.backendURL.absoluteString, dryRun: dryRun,
                            storage: .keychain(service: service),
                            consentCategories: [.necessary, .functionality, .experience, .measurement, .marketing],
                            vendors: review.vendorIDs,
                            iab: IABConfiguration(cmpId: review.cmpId, cmpVersion: review.cmpVersion, publisherCountryCode: review.publisherCountry)))
                    }.value
                    self.policyURL = review.privacyPolicyURL
                    reviewProfile = review
                    try review.save()
                    reviewReconnect = true
                    consentUIEnabled = !inspectBeforeShowingConsent
                } else {
                    let raw = url ?? Bundle.main.object(forInfoDictionaryKey: "C15tBackendURL") as? String ?? ""
                    let privacy = policy ?? Bundle.main.object(forInfoDictionaryKey: "C15tPrivacyPolicyURL") as? String ?? ""
                    guard let backend = URL(string: raw), backend.scheme == "https", backend.host != nil,
                        let policyURL = URL(string: privacy), policyURL.scheme == "https", policyURL.host != nil else { return }
                    self.policyURL = policyURL
                    let config = C15tAppleConfiguration(backendURL: backend.absoluteString, dryRun: dryRun, consentCategories: [.necessary, .functionality, .experience, .measurement, .marketing])
                    core = try await Task.detached { try C15tApple.install(config) }.value
                }
            }
            started = true
            observer = core.onChange { [weak self] in self?.consentDidChange($0) }
            let stream = core.eventStream
            events = Task { [weak self] in
                for await event in stream {
                    guard let self else { return }
                    if case .saveQueued = event { commitCount += 1 }
                    if case .error(let info) = event { lastError = info.code }
                    refresh(core)
                }
            }
            // The app-wide prompt the one-line modifier attaches to, so the journeys run
            // the default auto-present path.
            prompt = ConsentPrompt.shared(for: core)
            refresh(core)
        } catch { setupError = String(describing: error) }
    }
    nonisolated func consentDidChange(_ snapshot: ConsentSnapshot) {
        Task { @MainActor [weak self] in
            guard let self, let core = self.prompt?.core else { return }
            self.refresh(core)
        }
    }
    func refresh(_ core: ConsentCore) {
        snapshot = core.snapshot()
        Task { pendingSaves = await Task.detached { core.pendingSaveCount() }.value }
        if let value = core.iabConsent() {
            iabSummary = "purposes=\(value.choices.purposeConsents); purposeLI=\(value.choices.purposeLegitimateInterests); purposeObjections=\(value.choices.purposeObjections); vendors=\(value.choices.vendorConsents); vendorObjections=\(value.choices.vendorObjections); ac=\(value.addtlConsent ?? "none")"
        } else { iabSummary = "none" }
        if let url = reportURL, let bytes = try? JSONEncoder().encode(snapshot), let raw = String(data: bytes, encoding: .utf8) {
            let body: [String: Any] = ["core": "native", "snapshot": raw, "session": launchID]
            if let data = try? JSONSerialization.data(withJSONObject: body) {
                var request = URLRequest(url: url)
                request.httpMethod = "POST"; request.httpBody = data
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                URLSession.shared.dataTask(with: request).resume()
            }
        }
    }
    func refreshReviewDiagnostics() {
        guard let profile = reviewProfile, let core = prompt?.core else { return }
        let capturedAtMs = Int64(Date().timeIntervalSince1970 * 1000)
        let current = core.snapshot()
        let committed = core.iabConsent()
        let loadedGoogle = current.iab?.gvl?.vendor(755)
        let google = loadedGoogle.map { vendor in
            IABReviewGoogleVendor(id: vendor.id, name: vendor.name, deleted: vendor.isDeleted,
                purposes: vendor.purposes, legIntPurposes: vendor.legIntPurposes, flexiblePurposes: vendor.flexiblePurposes)
        }
        let providers = core.adTechProviderDisclosures()?.map { provider in
            IABReviewAdTechProvider(id: provider.id, name: provider.name, policyUrl: provider.policyUrl)
        }
        let info = Bundle.main.infoDictionary ?? [:]
        let report = IABReviewReport(capturedAtMs: capturedAtMs, profile: profile, sdkVersion: C15tApple.version,
            appID: Bundle.main.bundleIdentifier ?? "unspecified",
            appVersion: info["CFBundleShortVersionString"] as? String ?? "unspecified",
            appBuild: info["CFBundleVersion"] as? String ?? "unspecified",
            operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
            model: current.model.rawValue, policyPending: current.policyPending,
            disclosedGVLVersion: current.iab?.gvl?.vendorListVersion,
            disclosedPolicyVersion: current.iab?.gvl?.tcfPolicyVersion,
            committedTCString: committed?.tcString, committedAdditionalConsent: committed?.addtlConsent,
            committedGVLVersion: committed?.vendorListVersion,
            committedPolicyVersion: committed?.policyVersion,
            iabStatus: core.iabStatus().availability.rawValue, googleVendor: google,
            additionalConsentStatus: core.additionalConsentStatus().rawValue, adTechProviders: providers,
            storage: IABReviewStorageEntry.read(from: .standard, keys: TcStorageBusKeys.allNames))
        do {
            let json = try report.json()
            reviewReport = report.text
            reviewJSON = json
            setupError = nil
        } catch { setupError = "The diagnostic report could not be encoded: \(error.localizedDescription)" }
    }
    func resetReviewConsent() async {
        guard reviewProfile != nil, let core = prompt?.core, !resettingReview else { return }
        resettingReview = true
        defer { resettingReview = false }
        await Task.detached { core.reset() }.value
        refresh(core)
    }
    func forgetReviewSetup() {
        IABReviewProfile.forget()
        reviewReconnect = false
    }
    func showConsentScreen() {
        consentUIEnabled = true
    }
    deinit { observer?.cancel(); events?.cancel() }
    enum DemoError: Error { case missingFixture }
}

struct DemoRoot: View {
    @ObservedObject var session: DemoSession
    @State private var backend = "https://example-inth.inth.app/"
    @State private var policy = ""
    @State private var iabReview = false
    @State private var cmpId = ""
    @State private var cmpVersion = ""
    @State private var publisherCountry = ""
    @State private var vendorIDs = ""
    @State private var inspectBeforeShowingConsent = false
    var body: some View {
        if let prompt = session.prompt, let policyURL = session.policyURL {
            // Review inspection holds the prompt back with the opt-out until the reviewer asks for it.
            HostState(session: session, prompt: prompt)
                .c15tConsent(privacyPolicyURL: policyURL, theme: consentTheme, autoPresent: session.consentUIEnabled)
        } else {
            NavigationStack {
                Form {
                    Section("Connect an Inth project") {
                        Text("Use the example Inth project or your own project, and enter your app's privacy policy URL.")
                        TextField("Inth project URL", text: $backend).textInputAutocapitalization(.never).keyboardType(.URL)
                        TextField("Privacy policy URL", text: $policy).textInputAutocapitalization(.never).keyboardType(.URL)
                        Toggle("IAB review mode", isOn: $iabReview).accessibilityIdentifier("review.mode")
                        if iabReview {
                            Text("Use your supplied CMP identity and a project configured for IAB. The example project has no IAB policy. These fields validate format only; they do not verify registration or certification.")
                            TextField("CMP ID", text: $cmpId).keyboardType(.numberPad).accessibilityIdentifier("review.cmp-id")
                            TextField("CMP version", text: $cmpVersion).keyboardType(.numberPad).accessibilityIdentifier("review.cmp-version")
                            Text("CMP version is the internal CMP version from 0 to 4095, separate from the SDK version.").font(.caption)
                            TextField("Publisher country", text: $publisherCountry).textInputAutocapitalization(.characters).autocorrectionDisabled().accessibilityIdentifier("review.publisher-country")
                            TextField("Vendor IDs, optional", text: $vendorIDs).keyboardType(.numbersAndPunctuation).accessibilityIdentifier("review.vendor-ids")
                            Text("Enter comma-separated vendor IDs or leave empty to keep the backend-served list. Empty does not mean zero vendors. Successful review setup is saved on this device and reconnects on launch. Consent uses an app-specific review Keychain service.").font(.caption)
                            Toggle("Inspect before showing consent", isOn: $inspectBeforeShowingConsent).accessibilityIdentifier("review.inspect-before-consent")
                            Text("Review diagnostics before any consent action. Policy resolution and protected storage still start normally. This option applies only to this launch.").font(.caption)
                        }
                        Button("Connect") {
                            Task {
                                do {
                                    let review = iabReview ? try IABReviewProfile(backend: backend, privacyPolicy: policy, cmpId: cmpId, cmpVersion: cmpVersion, publisherCountry: publisherCountry, vendorIDs: vendorIDs) : nil
                                    await session.start(url: backend, policy: policy, review: review, inspectBeforeShowingConsent: iabReview && inspectBeforeShowingConsent)
                                } catch { session.setupError = error.localizedDescription }
                            }
                        }
                    }
                    #if DEBUG
                    Section("Local policy fixtures") {
                        Text("No hosted project is contacted. IAB uses a test CMP identity and sample disclosures. Restart the app to choose another mode.")
                        ForEach(["category", "notice", "iab"], id: \.self) { mode in
                            Button(mode == "iab" ? "IAB TCF and Additional Consent" : mode.capitalized) {
                                Task { await session.start(localScenario: "demo-" + mode) }
                            }.accessibilityIdentifier("demo.mode." + mode)
                        }
                    }
                    #endif
                    if let error = session.setupError { Text(error) }
                }.disabled(session.starting).navigationTitle("Consent prototype")
            }
        }
    }
}

struct HostState: View {
    @ObservedObject var session: DemoSession
    @ObservedObject var prompt: ConsentPrompt
    @State private var confirmReviewReset = false
    var body: some View {
        NavigationStack {
            List {
                Section("Privacy") {
                    Button("Privacy settings") { prompt.presentPreferences() }.frame(minHeight: 44).disabled(!session.consentUIEnabled).accessibilityIdentifier("fixture.open-preferences")
                }
                if session.reviewProfile != nil {
                    Section("IAB review") {
                        Text("Hosted IAB review mode. Registration and certification must be verified separately.")
                        if !session.snapshot.policyPending && session.snapshot.model != .iab {
                            Text("This project did not resolve an IAB policy. Its current screens and category choices do not demonstrate an IAB consent flow.")
                        }
                        NavigationLink("Review diagnostics") { IABReviewDiagnosticsView(session: session) }.accessibilityIdentifier("review.open-diagnostics")
                        if !session.consentUIEnabled {
                            Button("Show consent screen") { session.showConsentScreen() }.accessibilityIdentifier("review.show-consent")
                        }
                        Button("Reset review consent", role: .destructive) { confirmReviewReset = true }.disabled(session.resettingReview).accessibilityIdentifier("review.reset")
                        Text("Reset clears consent and reloads policy. The subject and saved review setup are retained.").font(.caption)
                    }
                }
                if session.fixture {
                    Section("Native authority") {
                        Text("\(session.snapshot.promptRequirement.kind.rawValue)").accessibilityIdentifier("fixture.state.prompt")
                        Text(session.snapshot.policyPending ? "true" : "false").accessibilityIdentifier("fixture.state.policy-pending")
                        Text(session.snapshot.explicitChoice == nil ? "none" : "recorded").accessibilityIdentifier("fixture.state.explicit-choice")
                        ForEach(OptionalConsentCategory.ordered, id: \.self) { category in
                            Text("\(category.rawValue): \(session.snapshot.effectivePermissions.value(for: category) ? "true" : "false")").accessibilityIdentifier("fixture.state.permission.\(category.rawValue)")
                        }
                        Text("\(session.pendingSaves)").accessibilityIdentifier("fixture.state.pending-saves")
                        Text("\(session.commitCount)").accessibilityIdentifier("fixture.state.commits")
                        Text(session.iabSummary).font(.caption).accessibilityIdentifier("fixture.state.iab")
                        Text(session.lastError).accessibilityIdentifier("fixture.state.last-error")
                    }
                    Section("Test faults") {
                        Button("Refuse next storage write") { session.store?.failNext = true }.accessibilityIdentifier("fixture.fail-next-write")
                        Button("Competing accept") { Task.detached { prompt.core.save(.all) } }.accessibilityIdentifier("fixture.competing-save")
                        Button("Reconnect") { session.transport?.offline = false; prompt.core.replayThenRefresh() }.accessibilityIdentifier("fixture.reconnect")
                    }
                }
                Section("About this demo") {
                    Text(session.fixture ? "Local protocol fixture" : "Inth hosted project")
                }
            }.navigationTitle("Settings").accessibilityIdentifier("fixture.state")
                .confirmationDialog("Reset review consent?", isPresented: $confirmReviewReset, titleVisibility: .visible) {
                    Button("Reset consent", role: .destructive) { Task { await session.resetReviewConsent() } }
                } message: {
                    Text("This clears the current consent decision and reloads policy. It keeps the same subject and review setup. It does not erase other Keychain items.")
                }
        }
    }
}

struct IABReviewDiagnosticsView: View {
    @ObservedObject var session: DemoSession
    var body: some View {
        List {
            Section {
                Text("This snapshot reads the core TC String and actual platform storage separately. Refresh after a choice or policy change. Missing or mismatched keys are shown as observed. The report contains no subject IDs, external IDs or receipts.")
                Button("Refresh diagnostics") { session.refreshReviewDiagnostics() }
                ShareLink(item: session.reviewReport) { Label("Share or copy report", systemImage: "square.and.arrow.up") }.accessibilityIdentifier("review.share-report")
                ShareLink(item: session.reviewJSON) { Label("Share diagnostic JSON", systemImage: "square.and.arrow.up") }.disabled(session.reviewJSON.isEmpty).accessibilityIdentifier("review.share-json")
                if let error = session.setupError { Text(error).foregroundStyle(.red) }
                if !session.consentUIEnabled {
                    Text("The stock presenter is waiting for inspection. Native policy resolution and protected storage are active.")
                    Button("Show consent screen") { session.showConsentScreen() }.accessibilityIdentifier("review.show-consent")
                }
            }
            Section("Review report") {
                Text(session.reviewReport).font(.system(.caption, design: .monospaced)).textSelection(.enabled).accessibilityIdentifier("review.report")
            }
            Section("Saved setup") {
                if session.reviewReconnect {
                    Button("Stop reconnecting on launch") { session.forgetReviewSetup() }
                    Text("This removes only the saved review configuration. Current consent and this session stay active. Restart the app to choose another mode.").font(.caption)
                } else {
                    Text("Automatic reconnect is off. Restart the app to choose another mode.")
                }
            }
        }.navigationTitle("IAB diagnostics").onAppear { session.refreshReviewDiagnostics() }
    }
}

extension DemoRoot {
    /// Debug fixtures can opt into the sample brand theme. Other launches use the stock c15t
    /// appearance with the demo's own name above the headline, as a real app would set.
    var consentTheme: ConsentTheme? {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        if env["C15T_FIXTURE_SCENARIO"] != nil {
            var theme = env["C15T_FIXTURE_THEME"] == "brand" ? PantryBrand.theme : ConsentTheme.c15t
            switch env["C15T_FIXTURE_BRANDING"] {
            case "inth": theme.branding = .inth
            case "custom": theme.branding = .custom(name: "Pantry", markImageName: "ConsentDemoMark")
            case "wide-custom": theme.branding = .custom(name: "Example Privacy Platform")
            case "hidden": theme.showsBranding = false
            default: break
            }
            switch env["C15T_FIXTURE_IDENTITY"] {
            // A mark that does not exist in the catalogue exercises the drawn initial tile.
            case "generic": theme.brand = ConsentTheme.Brand(markImageName: "ConsentDemoMissingMark")
            case "hidden": theme.brand = .hidden
            default: break
            }
            return theme
        }
        #endif
        var theme = ConsentTheme.resolved()
        theme.brand.name = "c15t Demo"
        return theme
    }
}

/// A fictional grocery app's appearance: a teal primary on mint paper, rounded display type,
/// roomier spacing, a larger type scale, pill decisions, and its own mark and headline.
/// Everything here goes through the public theme.
enum PantryBrand {
    static let theme = ConsentTheme(
        colors: ConsentTheme.Colors(
            canvas: ConsentThemeColor(light: 0xF3FAF7, dark: 0x0F1A17),
            surface: ConsentThemeColor(light: 0xFFFFFF, dark: 0x17241F),
            surfaceMuted: ConsentThemeColor(light: 0xE2F1EB, dark: 0x1F3029),
            text: ConsentThemeColor(light: 0x10201C, dark: 0xEAF4F0),
            textMuted: ConsentThemeColor(light: 0x5C7169, dark: 0x9DB3AC),
            primary: ConsentThemeColor(light: 0x00796B, dark: 0x4FD1C0),
            textOnPrimary: ConsentThemeColor(light: 0xFFFFFF, dark: 0x06302A),
            decision: ConsentThemeColor(light: 0x00796B, dark: 0x4FD1C0),
            textOnDecision: ConsentThemeColor(light: 0xFFFFFF, dark: 0x06302A)),
        radius: ConsentTheme.Radius(md: 10),
        spacing: ConsentTheme.Spacing(md: 20, lg: 28),
        typography: ConsentTheme.Typography(headlineFont: .rounded,
            fontSize: ConsentTheme.Typography.FontSize(sm: 16, base: 18)),
        slots: [.buttonPrimary: ConsentTheme.SlotStyle(borderRadius: 26)],
        brand: ConsentTheme.Brand(name: "Pantry", markImageName: "ConsentDemoMark"),
        copy: ConsentTheme.Copy(
            headline: "Before you shop.",
            introduction: "Pantry uses data to remember your basket, measure what works and show offers you might like."))
}

/// Test-only fault at the durable storage boundary. A refusal preserves the prior bytes.
final class FaultStore: ConsentStore, @unchecked Sendable {
    let base: any ConsentStore
    private let lock = NSLock()
    private var fail = false
    var failNext: Bool { get { lock.withLock { fail } } set { lock.withLock { fail = newValue } } }
    init(base: any ConsentStore) { self.base = base }
    func data(for key: String) -> Data? { base.data(for: key) }
    func read(for key: String) throws -> Data? { try base.read(for: key) }
    func set(_ data: Data?, for key: String) -> Bool {
        // Platform startup can refresh policy after hydration. Keep the test fault
        // armed until an acknowledgement or explicit decision reaches storage.
        func action(_ value: Data?) -> NSDictionary {
            let root = value.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any] ?? [:]
            let snapshot = root["snapshot"] as? [String: Any] ?? [:]
            return ["choice": snapshot["explicitChoice"] ?? NSNull(), "notice": root["noticeDismissal"] ?? NSNull()]
        }
        let decisionWrite = key == StorageKey.snapshot && !action(data).isEqual(action(base.data(for: key)))
        let refuse = lock.withLock { () -> Bool in
            if fail && decisionWrite { fail = false; return true }
            return false
        }
        return refuse ? false : base.set(data, for: key)
    }
}

/// Test-only HTTP peer. HostedTransport still parses init and produces the real save body.
final class FixtureHTTP: HTTPTransport, @unchecked Sendable {
    let body: Data
    private let lock = NSLock()
    private var disconnected: Bool
    var offline: Bool { get { lock.withLock { disconnected } } set { lock.withLock { disconnected = newValue } } }
    init(body: Data, offline: Bool) { self.body = body; self.disconnected = offline }
    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        if request.method == .get {
            return offline ? HTTPResponse(status: 503) : HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: body)
        }
        if let data = request.body {
            let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try? data.write(to: folder.appendingPathComponent("last-save.json"), options: .atomic)
        }
        return HTTPResponse(status: 503)
    }
}
