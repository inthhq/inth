// #region docs:swift-privacy-status title="ContentView.swift"
import C15tConsentUI
import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            Button("Privacy settings") {
                ConsentPrompt.current?.presentPreferences()
            }
            .navigationTitle("My app")
        }
    }
}
// #endregion docs:swift-privacy-status
