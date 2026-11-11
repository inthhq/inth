// #region docs:swift-consent-model title="ConsentModel.swift"
import C15tApple
import C15tConsentUI
import C15tCore
import Combine
import Foundation

@MainActor
final class ConsentModel: ObservableObject {
    @Published private(set) var state: PublishedConsent?
    @Published private(set) var presenter: ConsentPresenter?
    @Published private(set) var installationError: Error?
    private let backendURL: URL

    init(backendURL: URL) {
        self.backendURL = backendURL
        install()
    }

    var storageCanRetry: Bool { installationError as? C15tAppleInstallationError == .protectedStorageUnavailable }

    func retryProtectedStorage() {
        guard storageCanRetry else { return }
        install()
    }

    private func install() {
        guard state == nil else { return }
        do {
            let core = try C15tApple.install(C15tAppleConfiguration(
                transport: .hosted(backendURL),
                consentCategories: [.necessary, .measurement, .marketing]
            ))
            state = PublishedConsent(core: core)
            presenter = ConsentPresenter(core: core)
            installationError = nil
        } catch {
            installationError = error
        }
    }
}
// #endregion docs:swift-consent-model
