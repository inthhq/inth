import C15tApple
import C15tCore
import C15tConsentUI
import SwiftUI

@main
struct ConsentDemoApp: App {
    @StateObject private var session = DemoSession()
    var body: some Scene {
        WindowGroup {
            DemoRoot(session: session).task { await session.start() }
                .preferredColorScheme(fixtureAppearance)
        }
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
final class DemoSession: ObservableObject, SnapshotObserver {
    @Published var presenter: ConsentPresenter?
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
    var fixture: Bool { ProcessInfo.processInfo.environment["C15T_FIXTURE_SCENARIO"] != nil }

    func start(url: String? = nil, policy: String? = nil) async {
        guard !started else { return }
        let env = ProcessInfo.processInfo.environment
        do {
            let core: ConsentCore
            if let scenario = env["C15T_FIXTURE_SCENARIO"] {
                #if DEBUG
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
                #else
                throw DemoError.missingFixture
                #endif
            } else {
                let raw = url ?? Bundle.main.object(forInfoDictionaryKey: "C15tBackendURL") as? String ?? ""
                let privacy = policy ?? Bundle.main.object(forInfoDictionaryKey: "C15tPrivacyPolicyURL") as? String ?? ""
                guard let backend = URL(string: raw), backend.scheme == "https", backend.host != nil,
                    let policyURL = URL(string: privacy), policyURL.scheme == "https", policyURL.host != nil else { return }
                self.policyURL = policyURL
                let config = C15tAppleConfiguration(transport: .hosted(backend), consentCategories: [.necessary, .functionality, .experience, .measurement, .marketing])
                core = try await Task.detached { try C15tApple.install(config) }.value
            }
            started = true
            observer = core.onChange(self)
            let stream = core.eventStream
            events = Task { [weak self] in
                for await event in stream {
                    guard let self else { return }
                    if case .saveQueued = event { commitCount += 1 }
                    if case .error(let info) = event { lastError = info.code }
                    refresh(core)
                }
            }
            presenter = ConsentPresenter(core: core)
            refresh(core)
        } catch { setupError = String(describing: error) }
    }
    nonisolated func consentDidChange(_ snapshot: ConsentSnapshot) {
        Task { @MainActor [weak self] in
            guard let self, let core = self.presenter?.core else { return }
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
    deinit { observer?.cancel(); events?.cancel() }
    enum DemoError: Error { case missingFixture }
}

struct DemoRoot: View {
    @ObservedObject var session: DemoSession
    @State private var backend = "https://example-inth.inth.app/"
    @State private var policy = ""
    var body: some View {
        if let presenter = session.presenter, let policyURL = session.policyURL {
            HostState(session: session, presenter: presenter).c15tConsent(presenter: presenter, privacyPolicyURL: policyURL, theme: fixtureTheme)
        } else {
            NavigationStack {
                Form {
                    Section("Connect an Inth project") {
                        Text("Use the example Inth project or your own project, and enter your app's privacy policy URL.")
                        TextField("Inth project URL", text: $backend).textInputAutocapitalization(.never).keyboardType(.URL)
                        TextField("Privacy policy URL", text: $policy).textInputAutocapitalization(.never).keyboardType(.URL)
                        Button("Connect") { Task { await session.start(url: backend, policy: policy) } }
                    }
                    if let error = session.setupError { Text(error) }
                }.navigationTitle("Consent prototype")
            }
        }
    }
}

struct HostState: View {
    @ObservedObject var session: DemoSession
    @ObservedObject var presenter: ConsentPresenter
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(session.fixture ? "Local protocol fixture" : "Inth hosted project").font(.headline)
                    Text("Native consent prototype").font(.subheadline)
                    Button("Privacy settings") { presenter.presentPreferences() }.frame(minHeight: 44).accessibilityIdentifier("fixture.open-preferences")
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
                        Button("Competing accept") { Task.detached { presenter.core.save(.all) } }.accessibilityIdentifier("fixture.competing-save")
                        Button("Reconnect") { session.transport?.offline = false; presenter.core.replayThenRefresh() }.accessibilityIdentifier("fixture.reconnect")
                    }
                }
            }.navigationTitle("Privacy demo").accessibilityIdentifier("fixture.state")
        }
    }
}

extension DemoRoot {
    /// Debug fixtures can opt into the sample brand theme; normal launches use the stock c15t appearance.
    var fixtureTheme: ConsentTheme? {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        if env["C15T_FIXTURE_SCENARIO"] != nil, env["C15T_FIXTURE_THEME"] == "brand" { return PantryBrand.theme }
        #endif
        return nil
    }
}

/// A fictional grocery app's appearance: a teal accent on mint paper, rounded display type,
/// and its own mark and headline. Everything here goes through the public theme.
enum PantryBrand {
    static let theme = ConsentTheme(
        colors: ConsentTheme.Colors(
            canvas: ConsentThemeColor(light: 0xF3FAF7, dark: 0x0F1A17),
            surface: ConsentThemeColor(light: 0xFFFFFF, dark: 0x17241F),
            surfaceMuted: ConsentThemeColor(light: 0xE2F1EB, dark: 0x1F3029),
            text: ConsentThemeColor(light: 0x10201C, dark: 0xEAF4F0),
            textSecondary: ConsentThemeColor(light: 0x5C7169, dark: 0x9DB3AC),
            accent: ConsentThemeColor(light: 0x00796B, dark: 0x4FD1C0),
            onAccent: ConsentThemeColor(light: 0xFFFFFF, dark: 0x06302A),
            decision: ConsentThemeColor(light: 0x00796B, dark: 0x4FD1C0),
            onDecision: ConsentThemeColor(light: 0xFFFFFF, dark: 0x06302A)),
        cornerRadius: 10,
        headlineFont: .rounded,
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
