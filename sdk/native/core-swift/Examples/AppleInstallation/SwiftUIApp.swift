import C15tApple
import C15tCore
import SwiftUI

@main
struct ConsentExampleApp: App {
    private let installationError: Error?

    init() {
        do {
            try InstallConsent.install()
            installationError = nil
        } catch {
            installationError = error
        }
        // Optional SDK startup belongs after this synchronous native gate.
        // A failed install leaves C15t.isAllowed(.measurement) false.
    }

    var body: some Scene {
        WindowGroup {
            Text(installationError == nil ? "Native consent installed" : "Consent storage unavailable")
        }
    }
}
