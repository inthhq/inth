// #region docs:swiftui-app title="Sources/swiftui-consent-app.swift"
import C15tApple
import C15tConsentUI
import C15tCore
import SwiftUI
import UIKit

@main
@MainActor
struct SwiftUIConsentApp: App {
    @StateObject private var consent: AppConsentModel
    @Environment(\.scenePhase) private var scenePhase
    private let configuration: SampleConfiguration?

    init() {
        let result = Result { try SampleConfiguration.load() }
        configuration = try? result.get()
        // Install now, before optional SDK startup. StateObject owns this model across scenes.
        let model = AppConsentModel(stockUI: configuration?.headless != true) {
            try result.get().install()
        }
        _consent = StateObject(wrappedValue: model)
    }

    var body: some Scene {
        WindowGroup {
            ConsentRoot(consent: consent, configuration: configuration)
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
                    consent.retryProtectedStorage()
                }
                .onChange(of: scenePhase) { phase in
                    if phase == .active { consent.retryProtectedStorage() }
                }
        }
    }
}
// #endregion docs:swiftui-app

private struct ConsentRoot: View {
    @ObservedObject var consent: AppConsentModel
    let configuration: SampleConfiguration?

    var body: some View {
        // #region docs:swiftui-presenter title="Sources/swiftui-consent-app.swift"
        if let presenter = consent.presenter, let configuration {
            ConsentDashboard(consent: consent, configuration: configuration)
                .c15tConsent(presenter: presenter, privacyPolicyURL: configuration.privacyPolicyURL)
        } else {
            ConsentDashboard(consent: consent, configuration: configuration)
        }
        // #endregion docs:swiftui-presenter
    }
}

private struct ConsentDashboard: View {
    @ObservedObject var consent: AppConsentModel
    let configuration: SampleConfiguration?
    @State private var customSettings = false

    var body: some View {
        NavigationStack {
            List {
                if configuration?.isDemo == true {
                    Section("Local demonstration") {
                        Text("A sample policy runs in this app. Choices persist in Keychain. The demo transport keeps consent records queued and never sends them.")
                        Text("The stock privacy link uses example.com/privacy. Configure your own policy URL for a hosted app.")
                            .font(.footnote)
                    }
                }
                Section("Consent") {
                    Text(consent.ready ? "Consent ready" : "Waiting for consent policy")
                        .accessibilityIdentifier("sample.readiness")
                    Text("Measurement: \(decisionLabel)")
                        .accessibilityIdentifier("sample.measurement")
                    Text(consent.snapshot?.explicitChoice == nil ? "No choice recorded" : "Choice recorded on this device")
                        .accessibilityIdentifier("sample.choice")
                    Button("Privacy settings") {
                        if let presenter = consent.presenter { presenter.presentPreferences() }
                        else { customSettings = true }
                    }
                    .disabled(!consent.ready)
                    .accessibilityIdentifier("sample.preferences")
                    Button("Retry policy connection") { consent.core?.refresh() }
                        .disabled(consent.core == nil)
                        .accessibilityIdentifier("sample.retry-policy")
                }
                if let error = consent.installationError {
                    Section("Consent unavailable") {
                        Text(error as? C15tAppleInstallationError == .protectedStorageUnavailable
                            ? "Protected consent storage is unavailable. Unlock the device and retry."
                            : error.localizedDescription)
                            .accessibilityIdentifier("sample.installation-error")
                        Text("Optional collection stays off. Protected storage is retried after unlock or app activation.")
                        Button("Retry protected storage") { consent.retryProtectedStorage() }
                    }
                }
                Section("Gated work") {
                    Text("This counter stands in for analytics. It records only while measurement is granted.")
                    Button("Record sample event") { consent.recordTap() }
                        .disabled(consent.decision != .granted)
                        .accessibilityIdentifier("sample.record")
                    Text("Recorded events: \(consent.eventCount)")
                        .accessibilityIdentifier("sample.events")
                }
                Section("Durable delivery") {
                    Text("Queued records: \(consent.queuedSaves)")
                        .accessibilityIdentifier("sample.queue")
                    Text(consent.deliveryMessage)
                    Text("A local save is not a backend receipt. Delivery can fail or be refused later.")
                        .font(.footnote)
                }
            }
            .navigationTitle(configuration?.headless == true ? "Custom consent" : "SwiftUI consent")
            .sheet(isPresented: $customSettings) {
                if let core = consent.core { HeadlessPreferences(core: core, consent: consent) }
            }
        }
    }

    private var decisionLabel: String {
        switch consent.decision {
        case .granted: return "Granted"
        case .denied: return "Denied"
        case .pending: return "Pending"
        }
    }
}
