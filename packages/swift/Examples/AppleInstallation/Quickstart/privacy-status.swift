// #region docs:swift-privacy-status title="ContentView.swift"
import InthConsentUI
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
