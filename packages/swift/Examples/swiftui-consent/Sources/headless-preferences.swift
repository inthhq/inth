import C15tCore
import SwiftUI

// #region docs:swiftui-draft title="Sources/headless-preferences.swift"
struct CategoryDraft {
    let revision: Int
    var measurement: Bool

    init(snapshot: ConsentSnapshot) {
        revision = snapshot.revision
        // Seed from the recorded choice, never from effective permissions.
        measurement = snapshot.explicitChoice?.categories[.measurement]?.value ?? false
    }

    func commit(to core: ConsentCore) -> CommitResult {
        core.save(.custom([.measurement: measurement]), expectedRevision: revision)
    }
}
// #endregion docs:swiftui-draft

/// Category-only custom UI. This mode never creates or mounts ConsentPresenter.
struct HeadlessPreferences: View {
    let core: ConsentCore
    @ObservedObject var consent: AppConsentModel
    @State private var draft: CategoryDraft
    @State private var pending = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(core: ConsentCore, consent: AppConsentModel) {
        self.core = core
        self.consent = consent
        _draft = State(initialValue: CategoryDraft(snapshot: core.snapshot()))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Necessary storage keeps your privacy choices. Measurement enables the app's sample event counter.")
                    Toggle("Allow measurement", isOn: $draft.measurement)
                        .accessibilityIdentifier("sample.custom.measurement")
                        .disabled(pending || !canEdit)
                }
                if !canEdit {
                    Text("Measurement editing is unavailable for the current policy. Use the stock presenter for IAB consent.")
                }
                if let error {
                    Text(error).accessibilityIdentifier("sample.custom.error")
                    Button("Reload current choices") {
                        draft = CategoryDraft(snapshot: core.snapshot())
                        self.error = nil
                    }
                    .disabled(pending)
                }
                Button(pending ? "Saving choices..." : "Save choices", action: save)
                    .disabled(pending || !canEdit)
                    .accessibilityIdentifier("sample.custom.save")
                Button("Reject measurement") {
                    draft.measurement = false
                    save()
                }
                .disabled(pending || !canEdit)
            }
            .navigationTitle("Privacy settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(pending)
                }
            }
            .interactiveDismissDisabled(pending)
        }
    }

    private var canEdit: Bool {
        let snapshot = consent.snapshot ?? core.snapshot()
        let restrictions = snapshot.restrictions[.measurement] ?? []
        return core.isReady() && snapshot.model != .iab
            && snapshot.consentCategories?.contains(.measurement) == true
            && !restrictions.contains(.gpc) && !restrictions.contains(.strictScope)
    }

    // #region docs:swiftui-save title="Sources/headless-preferences.swift"
    private func save() {
        guard !pending, canEdit else { return }
        pending = true
        let capturedDraft = draft
        Task { @MainActor in
            let result = await Task.detached(priority: .userInitiated) {
                capturedDraft.commit(to: core)
            }.value
            pending = false
            if result.status == .committed {
                dismiss()
            } else {
                // Keep the draft. A refused or failed write does not become a grant.
                error = result.error?.code == "concurrent-change"
                    ? "Settings changed while you were editing. Reload current choices before saving."
                    : "Couldn't save your choices. Nothing changed. Try again."
            }
        }
    }
    // #endregion docs:swiftui-save
}
