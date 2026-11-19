@_spi(InthInternal) import InthApple
import InthConsentUI
@_spi(InthInternal) import InthCore
import SwiftUI

/// What the launch arguments ask for, so a script can put the app on any screen with no taps.
struct LaunchOptions {
    enum Screen: String { case prompt, preferences, iab }
    /// `--screen prompt|preferences|iab`. The first layer by default.
    let screen: Screen
    /// `--iab`, or `--screen iab`: serve the IAB TCF fixture instead of the category one.
    let iab: Bool
    /// `--stock`: show the stock `InthConsentUI` screens instead of the custom ones.
    let stock: Bool

    init(arguments: [String]) {
        let named = arguments.firstIndex(of: "--screen").flatMap { index in
            arguments.indices.contains(index + 1) ? Screen(rawValue: arguments[index + 1]) : nil
        }
        screen = named ?? .prompt
        iab = arguments.contains("--iab") || screen == .iab
        stock = arguments.contains("--stock")
    }
}

@main
@MainActor
struct CustomConsentApp: App {
    private let options: LaunchOptions
    private let core: ConsentCore?
    @StateObject private var state: LedgerConsentState
    private let privacyPolicyURL = URL(string: "https://example.com/privacy")!

    init() {
        let options = LaunchOptions(arguments: ProcessInfo.processInfo.arguments)
        self.options = options
        // Installed before the first frame. The store is in memory, so every launch starts fresh.
        core = try? FixtureBackend.install(iab: options.iab)
        _state = StateObject(wrappedValue: LedgerConsentState(
            preferencesOpen: options.screen != .prompt, tab: options.screen == .iab ? 1 : 0))
    }

    var body: some Scene {
        WindowGroup {
            if let core {
                if options.stock {
                    StockRoot(core: core, screen: options.screen, privacyPolicyURL: privacyPolicyURL)
                } else {
                    Dashboard(core: core, openSettings: { state.preferencesOpen = true })
                        .overlay { LedgerConsent(core: core, privacyPolicyURL: privacyPolicyURL, state: state) }
                }
            }
        }
    }
}

/// The stock screens, for comparison: the public modifier and `ConsentPrompt`, nothing custom.
private struct StockRoot: View {
    let core: ConsentCore
    let screen: LaunchOptions.Screen
    let privacyPolicyURL: URL

    var body: some View {
        Dashboard(core: core, openSettings: { ConsentPrompt.current?.presentPreferences() })
            // No App Tracking Transparency alert: it would cover the screen being captured.
            .inthConsent(privacyPolicyURL: privacyPolicyURL, autoPresent: screen == .prompt, trackingRequest: .manual)
            .task {
                guard screen != .prompt else { return }
                // Settings open on the loaded policy, not on a placeholder.
                await core.waitUntilIdle()
                ConsentPrompt.current?.presentPreferences()
            }
    }
}

/// The app behind the consent UI: what each category may do now, from the committed decision.
private struct Dashboard: View {
    let core: ConsentCore
    let openSettings: () -> Void
    @StateObject private var consent: PublishedConsent
    @Environment(\.colorScheme) private var colorScheme

    init(core: ConsentCore, openSettings: @escaping () -> Void) {
        self.core = core
        self.openSettings = openSettings
        _consent = StateObject(wrappedValue: PublishedConsent(core: core))
    }

    var body: some View {
        let l = Ledger(dark: colorScheme == .dark)
        let copy = ConsentCopy.forLanguage(consent.snapshot.overrides.language)
        let labels = IABCopy.forLanguage(consent.snapshot.overrides.language)
        VStack(alignment: .leading, spacing: 0) {
            // Nothing is listed until the core has a policy.
            ConsentReady(core: core) {
                gate(.functionality, copy.functionalityTitle, labels)
                gate(.experience, copy.experienceTitle, labels)
                gate(.measurement, copy.measurementTitle, labels)
                gate(.marketing, copy.marketingTitle, labels)
            } fallback: {
                ProgressView().tint(l.ink)
            }
            Spacer()
            TextAction(text: copy.privacySettings, id: "ledger.dashboard.settings", action: openSettings)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(l.paper.ignoresSafeArea())
        .environment(\.ledger, l)
    }

    /// One category, on or off. The gate reads the saved decision and follows every change.
    private func gate(_ category: ConsentCategory, _ title: String, _ labels: IABCopy) -> some View {
        ConsentGate(category, core: core) {
            LedgerRow(index: "●", title: title, state: labels.appOn, id: "ledger.gate.\(category.rawValue)")
        } fallback: {
            LedgerRow(index: "○", title: title, state: labels.appOff, id: "ledger.gate.\(category.rawValue)")
        }
    }
}

/// Serves the consent demo's local `/init` fixtures. `HostedTransport` still parses the response
/// and builds the real save body; nothing leaves the device.
enum FixtureBackend {
    struct Missing: Error {}

    static func install(iab: Bool) throws -> ConsentCore {
        guard let resource = Bundle.main.url(forResource: iab ? "iab-init" : "category-init", withExtension: "json") else {
            throw Missing()
        }
        var body = try Data(contentsOf: resource)
        if iab { body = try addingCustomPartner(to: body) }
        return try InthApple.install(CoreConfig(
            store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body: body)),
            consentCategories: ConsentCategory.allCases,
            iab: iab ? IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB") : nil,
            initRetry: .disabled))
    }

    /// The fixture lists no partner outside the vendor list, so the app declares one of its own
    /// to show that section.
    private static func addingCustomPartner(to body: Data) throws -> Data {
        guard var json = try JSONSerialization.jsonObject(with: body) as? [String: Any] else { return body }
        let partner: [String: Any] = [
            "id": "house-ads", "name": "House Ads", "privacyPolicyUrl": "https://example.com/house-ads/privacy",
            "purposes": [1, 7], "legIntPurposes": [7], "features": [1], "dataRetentionDays": 30, "usesCookies": false,
        ]
        json["customVendors"] = [partner]
        return try JSONSerialization.data(withJSONObject: json)
    }

    private struct Peer: HTTPTransport {
        let body: Data
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            request.method == .get
                ? HTTPResponse(status: 200, headers: ["x-inth-policy-contract": "1"], body: body)
                : HTTPResponse(status: 503)
        }
    }
}
