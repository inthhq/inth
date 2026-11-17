import InthConsentUI
import InthCore
import SwiftUI

// A consent UI drawn entirely by the app on the headless blocks in `InthConsentUI`. Nothing
// here comes from the stock screens: the paper and ink palette, the serif and monospace type,
// the ruled ledger rows, the square switch and the motion are in `ledger-parts.swift`. The
// blocks supply when to show, the copy, the draft, the save and the accessibility.

/// What the app keeps about its own consent screens: whether preferences are open, and the tab.
@MainActor
final class LedgerConsentState: ObservableObject {
    @Published var preferencesOpen: Bool
    @Published var tab: Int

    init(preferencesOpen: Bool = false, tab: Int = 0) {
        self.preferencesOpen = preferencesOpen
        self.tab = tab
    }
}

// #region docs:swift-headless-prompt title="Sources/ledger-consent.swift"
struct LedgerConsent: View {
    @StateObject private var draft: ConsentDraft
    @ObservedObject private var state: LedgerConsentState
    private let privacyPolicyURL: URL
    @Environment(\.colorScheme) private var colorScheme

    init(core: ConsentCore, privacyPolicyURL: URL, state: LedgerConsentState) {
        // One draft for both screens, kept for as long as this view is.
        _draft = StateObject(wrappedValue: ConsentDraft(core: core))
        self.state = state
        self.privacyPolicyURL = privacyPolicyURL
    }

    var body: some View {
        ZStack {
            // The block decides when a prompt is owed. The sheet below is the app's own.
            HeadlessConsentPrompt(draft: draft, onOpenPreferences: { state.preferencesOpen = true }) { prompt in
                if !state.preferencesOpen {
                    // The partner count in the IAB text opens the partner list itself, not the first tab.
                    PromptSheet(prompt: prompt, draft: draft, policyURL: privacyPolicyURL, openPartners: {
                        state.tab = 2
                        prompt.openPreferences()
                    })
                }
            }
            if state.preferencesOpen {
                HeadlessConsentPreferences(draft: draft, onClose: { state.preferencesOpen = false }) { preferences in
                    PreferencesPage(preferences: preferences, draft: draft, tab: $state.tab, policyURL: privacyPolicyURL)
                }
            }
        }
        .environment(\.ledger, Ledger(dark: colorScheme == .dark))
    }
}
// #endregion docs:swift-headless-prompt

private struct PromptSheet: View {
    let prompt: ConsentPromptScope
    @ObservedObject var draft: ConsentDraft
    let policyURL: URL
    let openPartners: () -> Void
    @State private var shown = false
    @Environment(\.ledger) private var l
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        // An IAB first layer covers the screen. A category prompt or a notice rises from the bottom edge.
        let full = prompt.iab != nil
        ZStack(alignment: .bottom) {
            (full ? l.paper : l.ink.opacity(0.32)).ignoresSafeArea()
                // Touches stop here, so the app behind stays out of reach.
                .contentShape(Rectangle()).onTapGesture {}
                .accessibilityHidden(true)
            VStack(spacing: 0) {
                Rectangle().fill(l.accent).frame(height: 6)
                if full {
                    ScrollView { text }
                } else {
                    // The sheet is as tall as its text, and scrolls only when the text is too large to fit.
                    ViewThatFits(in: .vertical) {
                        text
                        ScrollView { text }
                    }
                }
                actions
            }
            .background(l.paper.ignoresSafeArea(edges: .bottom))
            .offset(y: shown ? 0 : 420)
            .opacity(shown ? 1 : 0)
        }
        .consentPane(prompt.title)
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("ledger.prompt")
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.82)) { shown = true }
        }
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let reason = prompt.reason { LedgerLabel(text: reason, accent: true) }
            Text(prompt.title).font(l.display).foregroundColor(l.ink)
                .accessibilityAddTraits(.isHeader).consentInitialFocus()
                .accessibilityIdentifier("ledger.prompt.title")
            Text(prompt.description).font(l.body).foregroundColor(l.ink)
            if let detail = prompt.detail { Text(detail).font(l.small).foregroundColor(l.faint) }
            if let iab = prompt.iab { IABFirstLayerText(text: iab, openPartners: openPartners) }
            LedgerLink(text: prompt.privacyPolicyLabel, url: policyURL)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 28).padding(.top, 28).padding(.bottom, 12)
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: 14) {
            Failure(draft: draft, retry: { draft.retry() })
            // Another surface decided meanwhile: the buttons do nothing until the record is read again.
            if prompt.isStale {
                Text(draft.iabCopy.appSettingsChanged).font(l.small).foregroundColor(l.ink)
                TextAction(text: draft.iabCopy.appLoadCurrentSettings, isEnabled: true, id: "ledger.prompt.reload", action: { prompt.reload() })
            }
            if prompt.isNotice {
                Stamp(text: prompt.acknowledgeLabel, draft: draft, action: .acknowledge, id: "ledger.prompt.acknowledge", onTap: { prompt.acknowledge() })
            } else if prompt.listUnavailable {
                // A stale vendor list cannot back a grant: say so, keep Reject all, offer a refresh.
                Text(prompt.listOutdated).font(l.small).foregroundColor(l.faint)
                Stamp(text: prompt.rejectAllLabel, draft: draft, action: .rejectAll, id: "ledger.prompt.reject", onTap: { prompt.rejectAll() })
                TextAction(text: draft.iabCopy.appTryAgain, isEnabled: !draft.isSaving, id: "ledger.prompt.refresh", action: { prompt.refresh() })
            } else {
                // Accept and reject get the same treatment and the same width.
                ConsentActions {
                    Stamp(text: prompt.rejectAllLabel, draft: draft, action: .rejectAll, id: "ledger.prompt.reject", onTap: { prompt.rejectAll() })
                    Stamp(text: prompt.acceptAllLabel, draft: draft, action: .acceptAll, id: "ledger.prompt.accept", onTap: { prompt.acceptAll() })
                }
            }
            TextAction(text: prompt.customizeLabel, isEnabled: !draft.isSaving, id: "ledger.prompt.customize", action: { prompt.openPreferences() })
        }
        .padding(.horizontal, 28).padding(.top, 8).padding(.bottom, 20)
    }
}

/// Everything the IAB first layer has to say, in the ledger's own setting.
private struct IABFirstLayerText: View {
    let text: IABFirstLayerContent
    let openPartners: () -> Void
    @Environment(\.ledger) private var l

    var body: some View {
        // The partner count is the link into the partner list.
        Button(action: openPartners) {
            (Text(text.descriptionLead) + Text(text.partnersLink).foregroundColor(l.accent).underline() + Text(text.descriptionTail))
                .font(l.small).foregroundColor(l.ink)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(LedgerPress())
        .accessibilityIdentifier("ledger.prompt.partners")
        VStack(spacing: 0) {
            ForEach(Array(text.summary.enumerated()), id: \.offset) { index, item in
                if index > 0 { LedgerRule() }
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    LedgerLabel(text: String(format: "%02d", index + 1), accent: true)
                    Text(item).font(l.row).foregroundColor(l.ink).frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
            }
        }
        .overlay(Rectangle().strokeBorder(l.rule, lineWidth: 1))
        Text(text.legitimateInterestNotice).font(l.small).foregroundColor(l.faint)
        Text(text.scope).font(l.small).foregroundColor(l.faint)
        Text(text.withdraw).font(l.small).foregroundColor(l.faint)
    }
}

// #region docs:swift-headless-preferences title="Sources/ledger-consent.swift"
private struct PreferencesPage: View {
    @ObservedObject var preferences: ConsentPreferencesScope
    @ObservedObject var draft: ConsentDraft
    @Binding var tab: Int
    let policyURL: URL
    @Environment(\.ledger) private var l

    var body: some View {
        let copy = draft.iabCopy
        let iab = preferences.iab
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(preferences.title).font(l.heading).foregroundColor(l.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader).consentInitialFocus()
                // Close goes through the scope, so unsaved edits ask first.
                TextAction(text: copy.appClose, isEnabled: !draft.isSaving, id: "ledger.preferences.close", action: { preferences.requestClose() })
            }
            .padding(.horizontal, 28).padding(.top, 18).padding(.bottom, 8)
            if iab != nil {
                LedgerTabs(titles: [copy.appThisApp, copy.preferenceCenterVendorListPurposes, copy.appPartners], selected: $tab)
                    .padding(.horizontal, 28)
            }
            LedgerRule(strong: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    if draft.isStale {
                        LedgerNotice(title: copy.appSettingsChanged, detail: copy.appSettingsChangedDetail, action: copy.appLoadCurrentSettings) { draft.reset() }
                    }
                    if draft.listUnavailable {
                        LedgerNotice(title: copy.appListOutdated, action: copy.appTryAgain) { draft.refresh() }
                    }
                    if let iab, tab == 1 {
                        IABPurposes(iab: iab)
                    } else if let iab, tab == 2 {
                        IABPartners(iab: iab)
                    } else {
                        Text(preferences.description).font(l.body).foregroundColor(l.ink).padding(.bottom, 12)
                        // Each row carries its copy, its lock and the setter for its switch.
                        ForEach(Array(preferences.categories.enumerated()), id: \.element.id) { index, row in
                            LedgerRow(index: String(format: "%02d", index + 1), title: row.title, description: row.description, note: row.note,
                                state: row.lockedLabel, isOn: row.locked ? nil : row.isOn, isEnabled: row.isEnabled,
                                id: "ledger.category.\(row.category.rawValue)", onChange: { row.set($0) })
                        }
                        if let changed = preferences.lastChanged {
                            Text(changed).font(l.small).foregroundColor(l.faint).padding(.top, 16)
                        }
                        LedgerLink(text: copy.preferenceCenterVendorListPrivacyPolicy, url: policyURL)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 28).padding(.vertical, 20)
            }
            LedgerRule(strong: true)
            VStack(alignment: .leading, spacing: 12) {
                if preferences.confirmDiscard {
                    Text(copy.appDiscardChangesTitle).font(l.row).foregroundColor(l.ink)
                    Text(copy.appDiscardChangesDetail).font(l.small).foregroundColor(l.faint)
                    ConsentActions {
                        Stamp(text: copy.appKeepEditing, draft: draft, filled: false, id: "ledger.discard.keep", onTap: { preferences.keepEditing() })
                        Stamp(text: copy.appDiscardChanges, draft: draft, id: "ledger.discard.confirm", onTap: { preferences.discard() })
                    }
                } else {
                    Failure(draft: draft, retry: { preferences.retry() })
                    ConsentActions {
                        Stamp(text: preferences.rejectAllLabel, draft: draft, action: .rejectAll, filled: false, id: "ledger.preferences.reject", onTap: { preferences.rejectAll() })
                        Stamp(text: preferences.acceptAllLabel, draft: draft, action: .acceptAll, filled: false, id: "ledger.preferences.accept", onTap: { preferences.acceptAll() })
                    }
                    Stamp(text: preferences.saveLabel, draft: draft, action: .save, accent: true, id: "ledger.preferences.save", onTap: { preferences.save() })
                }
            }
            .padding(.horizontal, 28).padding(.vertical, 16)
        }
        .background(l.paper.ignoresSafeArea())
        .consentPane(preferences.title)
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("ledger.preferences")
    }
}
// #endregion docs:swift-headless-preferences

// #region docs:swift-headless-iab title="Sources/ledger-consent.swift"
private struct IABPurposes: View {
    let iab: IABDraftHandle
    @Environment(\.ledger) private var l

    var body: some View {
        let copy = iab.draft.iabCopy
        ForEach(iab.purposes) { purpose in
            Expandable { toggle in
                LedgerRow(index: String(format: "%02d", purpose.id), title: purpose.name, description: purpose.description, note: purpose.partnersNote,
                    isOn: purpose.consent, isEnabled: purpose.isEnabled, id: "ledger.purpose.\(purpose.id).consent", onChange: { purpose.setConsent($0) })
                TextAction(text: "+", id: "ledger.purpose.\(purpose.id).more", action: toggle).padding(.leading, 40)
            } detail: {
                DefinitionText(definition: purpose.definition)
                // Turning the legitimate-interest switch off is the objection.
                if let interest = purpose.legitimateInterest {
                    if let explanation = iab.legitimateInterestExplanation { Text(explanation).font(l.small).foregroundColor(l.faint) }
                    LedgerRow(index: "LI", title: copy.preferenceCenterPurposeItemLegitimateInterest, description: purpose.rightToObject,
                        isOn: interest, isEnabled: purpose.isEnabled, id: "ledger.purpose.\(purpose.id).li", onChange: { purpose.setLegitimateInterest($0) })
                }
            }
        }
        if !iab.specialFeatures.isEmpty { LedgerSection(title: copy.preferenceCenterVendorListSpecialFeatures) }
        ForEach(iab.specialFeatures) { feature in
            LedgerRow(index: "SF", title: feature.name, description: feature.description, note: copy.appSpecialFeatureOptIn,
                isOn: feature.optIn, isEnabled: feature.isEnabled, id: "ledger.special-feature.\(feature.id)", onChange: { feature.setOptIn($0) })
            DefinitionText(definition: feature.definition)
        }
        // Special purposes and features take no choice: their standard text and no switch.
        if !iab.specialPurposes.isEmpty { LedgerSection(title: copy.preferenceCenterVendorListSpecialPurposes) }
        ForEach(iab.specialPurposes) { item in
            LedgerRow(index: "SP", title: item.name, description: item.description, state: copy.appNoChoice, id: "ledger.special-purpose.\(item.id)")
            DefinitionText(definition: item)
        }
        if let explanation = iab.specialPurposesExplanation, !iab.specialPurposes.isEmpty {
            Text(explanation).font(l.small).foregroundColor(l.faint)
        }
        if !iab.features.isEmpty { LedgerSection(title: copy.preferenceCenterFeaturesTitle) }
        ForEach(iab.features) { item in
            LedgerRow(index: "F", title: item.name, description: item.description, state: copy.appNoChoice, id: "ledger.feature.\(item.id)")
            DefinitionText(definition: item)
        }
        if !iab.features.isEmpty { Text(iab.featuresExplanation).font(l.small).foregroundColor(l.faint) }
        if let storage = iab.consentStorage { Text(storage).font(l.small).foregroundColor(l.faint).padding(.top, 16) }
    }
}

private struct IABPartners: View {
    let iab: IABDraftHandle
    @Environment(\.ledger) private var l

    var body: some View {
        ForEach(iab.vendors) { vendor in
            Partner(id: "ledger.vendor.\(vendor.id)", name: vendor.name, summary: vendor.summary, status: vendor.statusLabel,
                consent: vendor.consent, interest: vendor.legitimateInterest, isEnabled: vendor.isEnabled,
                setConsent: { vendor.setConsent($0) }, setInterest: { vendor.setLegitimateInterest($0) }, iab: iab,
                page: { PartnerPage(vendor.details, iab: iab) })
        }
        // Providers and custom partners are not IAB vendors, so each gets its own section and notice.
        if !iab.adTechProviders.isEmpty {
            LedgerSection(title: iab.adTechProvidersHeading)
            Text(iab.adTechProvidersNotice).font(l.small).foregroundColor(l.faint)
        }
        ForEach(iab.adTechProviders) { provider in
            LedgerRow(index: "AC", title: provider.name, isOn: provider.consent, isEnabled: provider.isEnabled,
                id: "ledger.provider.\(provider.id)", onChange: { provider.setConsent($0) })
            LedgerLink(text: iab.draft.iabCopy.preferenceCenterVendorListPrivacyPolicy, url: provider.policyURL)
        }
        if !iab.customVendors.isEmpty {
            LedgerSection(title: iab.customVendorsHeading)
            Text(iab.customVendorsNotice).font(l.small).foregroundColor(l.faint)
        }
        ForEach(iab.customVendors) { vendor in
            Partner(id: "ledger.custom-vendor.\(vendor.id)", name: vendor.name, summary: vendor.summary, status: vendor.statusLabel,
                consent: vendor.consent, interest: vendor.legitimateInterest, isEnabled: vendor.isEnabled,
                setConsent: { vendor.setConsent($0) }, setInterest: { vendor.setLegitimateInterest($0) }, iab: iab,
                page: { PartnerPage(vendor.details, iab: iab) })
        }
    }
}

/// One partner: a line in the ledger that opens in place to its switches and everything it discloses.
private struct Partner: View {
    let id: String
    let name: String
    let summary: String
    let status: String
    let consent: Bool?
    let interest: Bool?
    let isEnabled: Bool
    let setConsent: (Bool) -> Void
    let setInterest: (Bool) -> Void
    let iab: IABDraftHandle
    let page: () -> PartnerPage
    @Environment(\.ledger) private var l

    var body: some View {
        let copy = iab.draft.iabCopy
        Expandable { toggle in
            LedgerRow(index: "→", title: name, description: summary, state: status, id: id + ".row", more: toggle)
        } detail: {
            // Built only when the line is open.
            let page = self.page()
            if let note = page.note { Text(note).font(l.small.italic()).foregroundColor(l.faint) }
            LedgerLink(text: copy.preferenceCenterVendorListPrivacyPolicy, url: page.privacyPolicy)
            LedgerLink(text: copy.appLegitimateInterestStatement, url: page.legitimateInterestClaim)
            if let consent {
                LedgerRow(index: "C", title: copy.appConsent, description: page.consentPurposes.joined(separator: ", "),
                    isOn: consent, isEnabled: isEnabled, id: id + ".consent", onChange: setConsent)
            }
            if let interest {
                LedgerRow(index: "LI", title: copy.preferenceCenterPurposeItemLegitimateInterest, description: page.legitimateInterestPurposes.joined(separator: ", "),
                    note: copy.appTurnOffToObject, isOn: interest, isEnabled: isEnabled, id: id + ".li", onChange: setInterest)
                if let explanation = iab.legitimateInterestExplanation { Text(explanation).font(l.small).foregroundColor(l.faint) }
            }
            if !page.notAllowedPurposes.isEmpty {
                Text(copy.format(copy.appNotAllowedPurposes, ["purposes": page.notAllowedPurposes.joined(separator: ", ")]))
                    .font(l.small).foregroundColor(l.faint)
            }
            Group {
                Facts(title: copy.preferenceCenterVendorListSpecialPurposes, facts: PartnerPage.facts(page.specialPurposes, value: copy.appNoChoice))
                // Wherever features appear they carry their standard text and illustrations, and no switch.
                if !page.features.isEmpty { LedgerLabel(text: copy.preferenceCenterFeaturesTitle).padding(.top, 10) }
                ForEach(page.features) { feature in
                    LedgerRow(index: "F", title: feature.name, description: feature.description, state: copy.appNoChoice, id: id + ".feature.\(feature.id)")
                    ForEach(feature.illustrations, id: \.self) { Text("\u{2014} " + $0).font(l.small).foregroundColor(l.faint) }
                }
                if !page.features.isEmpty { Text(iab.featuresExplanation).font(l.small).foregroundColor(l.faint) }
                Facts(title: copy.preferenceCenterVendorListSpecialFeatures, facts: page.specialFeatures)
                Facts(title: copy.appDataCollected, facts: PartnerPage.facts(page.dataCategories, value: nil))
                Facts(title: copy.appRetentionTitle, facts: page.retention)
                Facts(title: copy.appDeviceStorage, facts: page.storage)
                LedgerLink(text: copy.appDeviceStorageDetails, url: page.storageDisclosure)
            }
        }
        .accessibilityIdentifier(id)
    }
}

/// What a partner's opened line shows, from a registered partner's page or a custom partner's.
private struct PartnerPage {
    var note: String? = nil
    let privacyPolicy: URL?
    var legitimateInterestClaim: URL? = nil
    let consentPurposes: [String]
    let legitimateInterestPurposes: [String]
    var notAllowedPurposes: [String] = []
    var specialPurposes: [String] = []
    let features: [IABDefinitionContent]
    let specialFeatures: [(label: String, value: String?)]
    let dataCategories: [String]
    let retention: [(label: String, value: String?)]
    let storage: [(label: String, value: String?)]
    var storageDisclosure: URL? = nil

    @MainActor init(_ vendor: IABVendorContent, iab: IABDraftHandle) {
        let copy = iab.draft.iabCopy
        privacyPolicy = vendor.privacyPolicy
        legitimateInterestClaim = vendor.legitimateInterestClaim
        consentPurposes = vendor.consentPurposes
        legitimateInterestPurposes = vendor.legitimateInterestPurposes
        notAllowedPurposes = vendor.notAllowedPurposes
        specialPurposes = vendor.specialPurposes
        features = vendor.features
        specialFeatures = Self.optIns(ids: vendor.specialFeatureIds, names: vendor.specialFeatures, iab: iab)
        dataCategories = vendor.dataCategories
        // No retention row means the partner gave none. No storage row means it stores nothing.
        retention = Self.facts(vendor.retention, empty: copy.appRetentionNotProvided)
        storage = Self.facts(vendor.storesOnDevice ? vendor.storage : [], empty: copy.appNoDeviceStorage)
        storageDisclosure = vendor.storageDisclosure
    }

    @MainActor init(_ vendor: IABCustomVendorContent, iab: IABDraftHandle) {
        let copy = iab.draft.iabCopy
        note = vendor.note
        privacyPolicy = vendor.privacyPolicy
        consentPurposes = vendor.consentPurposes
        legitimateInterestPurposes = vendor.legitimateInterestPurposes
        features = vendor.features
        specialFeatures = Self.optIns(ids: vendor.specialFeatureIds, names: vendor.specialFeatures, iab: iab)
        dataCategories = vendor.dataCategories
        retention = Self.facts(vendor.retention, empty: copy.appRetentionNotProvided)
        storage = Self.facts(vendor.storesOnDevice ? vendor.storage : [], empty: copy.appNoDeviceStorage)
    }

    /// Each special feature the partner uses, with the person's opt-in for it in the draft.
    @MainActor private static func optIns(ids: [Int], names: [String], iab: IABDraftHandle) -> [(label: String, value: String?)] {
        let copy = iab.draft.iabCopy
        let selected = iab.choices.specialFeatureOptIns
        var result: [(label: String, value: String?)] = []
        for (id, name) in zip(ids, names) {
            result.append((label: name, value: selected.contains(id) ? copy.appOn : copy.appOff))
        }
        return result
    }

    /// The partner's own rows, or one line saying it gave none.
    private static func facts(_ rows: [IABVendorContent.Row], empty: String) -> [(label: String, value: String?)] {
        var result: [(label: String, value: String?)] = []
        for row in rows { result.append((label: row.label, value: row.value)) }
        if result.isEmpty { result.append((label: empty, value: nil)) }
        return result
    }

    /// Plain names as lines that share one value, such as "No choice".
    static func facts(_ names: [String], value: String?) -> [(label: String, value: String?)] {
        var result: [(label: String, value: String?)] = []
        for name in names { result.append((label: name, value: value)) }
        return result
    }
}
// #endregion docs:swift-headless-iab

/// A definition's legal text and the vendor list's standard illustrations, shown unchanged.
private struct DefinitionText: View {
    let definition: IABDefinitionContent
    @Environment(\.ledger) private var l
    var body: some View {
        if let legal = definition.descriptionLegal, !legal.isEmpty { Text(legal).font(l.small).foregroundColor(l.faint) }
        ForEach(definition.illustrations, id: \.self) { Text("· " + $0).font(l.small).foregroundColor(l.faint) }
    }
}
