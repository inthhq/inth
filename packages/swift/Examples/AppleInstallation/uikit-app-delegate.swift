import C15tApple
import C15tCore
import UIKit

@main
final class ConsentExampleAppDelegate: UIResponder, UIApplicationDelegate {
    private(set) var installationError: Error?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(retryOnActivation(_:)),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        do {
            try InstallConsent.install()
        } catch {
            installationError = error
        }
        // App launch continues; optional SDKs remain off unless native gates allow them.
        return true
    }

    func applicationProtectedDataDidBecomeAvailable(_ application: UIApplication) {
        retryInstallation()
    }

    @objc private func retryOnActivation(_: Notification) {
        retryInstallation()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func retryInstallation() {
        guard installationError as? C15tAppleInstallationError == .protectedStorageUnavailable else { return }
        do {
            try InstallConsent.install()
            installationError = nil
            // Reevaluate native gates before starting any optional SDK after recovery.
        } catch {
            installationError = error
        }
    }
}
