import InthApple
import InthCore
import SwiftUI
import UIKit

@main
struct ConsentExampleApp: App {
    @State private var installationError: Error?

    init() {
        do {
            try InstallConsent.install()
            _installationError = State(initialValue: nil)
        } catch {
            _installationError = State(initialValue: error)
        }
        // Optional SDK startup belongs after this synchronous native gate.
        // A failed install leaves Inth.isAllowed(.measurement) false.
    }

    var body: some Scene {
        WindowGroup {
            Text(installationError == nil ? "Native consent installed" : "Consent storage unavailable")
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
                    retryInstallation()
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                    retryInstallation()
                }
        }
    }

    private func retryInstallation() {
        guard installationError as? InthAppleInstallationError == .protectedStorageUnavailable else { return }
        do {
            try InstallConsent.install()
            installationError = nil
            // Reevaluate native gates before starting any optional SDK after recovery.
        } catch {
            installationError = error
        }
    }
}
