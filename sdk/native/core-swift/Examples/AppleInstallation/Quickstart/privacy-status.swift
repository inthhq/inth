// #region docs:swift-privacy-status title="PrivacyStatus.swift"
import C15tConsentUI
import C15tCore
import SwiftUI

struct PrivacyStatus: View {
    @ObservedObject var state: PublishedConsent
    let presenter: ConsentPresenter?

    var body: some View {
        Text(state.isReady ? "Privacy choices ready" : "Loading privacy choices")
        Text(state.decision(for: .measurement) == .granted ? "Measurement allowed" : "Measurement off")
        Button("Privacy settings") { presenter?.presentPreferences() }
            .disabled(!state.isReady)
        Button("Retry policy connection") { state.core.refresh() }
    }
}
// #endregion docs:swift-privacy-status
