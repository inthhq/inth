import C15tConsentUI
import SwiftUI

// The ledger look: paper and ink, serif and monospace type, ruled rows, a square switch. Every
// colour, font and measure the custom consent UI uses is in this file. None comes from the SDK.

struct Ledger {
    let paper: Color
    let ink: Color
    let faint: Color
    let rule: Color
    let accent: Color
    let onAccent: Color

    init(dark: Bool) {
        func hex(_ value: UInt32) -> Color {
            Color(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
        }
        paper = hex(dark ? 0x14130F : 0xF4EFE6)
        ink = hex(dark ? 0xF1ECE2 : 0x1B1A17)
        faint = hex(dark ? 0xA39C8D : 0x6B655A)
        rule = hex(dark ? 0x3A372F : 0xCFC7B8)
        accent = hex(dark ? 0xFF7A59 : 0xC23B1E)
        onAccent = hex(dark ? 0x14130F : 0xFFFFFF)
    }

    // Text styles, so every size follows Dynamic Type.
    var display: Font { .system(.largeTitle, design: .serif).italic() }
    var heading: Font { .system(.title, design: .serif).italic() }
    var body: Font { .system(.body, design: .serif) }
    var small: Font { .system(.footnote, design: .serif) }
    var label: Font { .system(.caption2, design: .monospaced) }
    var row: Font { .system(.subheadline, design: .monospaced).weight(.medium) }
}

private struct LedgerKey: EnvironmentKey {
    static let defaultValue = Ledger(dark: false)
}

extension EnvironmentValues {
    var ledger: Ledger {
        get { self[LedgerKey.self] }
        set { self[LedgerKey.self] = newValue }
    }
}

/// A pressed control dims. Nothing else changes, so a disabled one keeps the look its owner gives it.
struct LedgerPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// A small upper-case monospace label: an index, a state, a section name.
struct LedgerLabel: View {
    let text: String
    var accent = false
    @Environment(\.ledger) private var l
    var body: some View {
        Text(text.uppercased()).font(l.label).tracking(1.8).foregroundColor(accent ? l.accent : l.faint)
    }
}

/// A one-point rule.
struct LedgerRule: View {
    var strong = false
    @Environment(\.ledger) private var l
    var body: some View {
        Rectangle().fill(strong ? l.ink : l.rule).frame(height: 1)
    }
}

/// A ruled line of the ledger: an index, a title and text, and at the trailing edge a square
/// switch or a state. With `isOn` the whole line is the switch; with `more` alone it is a button.
struct LedgerRow: View {
    let index: String
    let title: String
    var description = ""
    var note: String? = nil
    var state: String? = nil
    var isOn: Bool? = nil
    var isEnabled = true
    let id: String
    var onChange: (Bool) -> Void = { _ in }
    var more: (() -> Void)? = nil
    @Environment(\.ledger) private var l

    var body: some View {
        VStack(spacing: 0) {
            Button {
                if let isOn { onChange(!isOn) } else { more?() }
            } label: {
                HStack(alignment: .top, spacing: 14) {
                    LedgerLabel(text: index, accent: true).frame(width: 26, alignment: .leading).padding(.top, 3)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title).font(l.row).foregroundColor(l.ink)
                        if !description.isEmpty { Text(description).font(l.small).foregroundColor(l.faint) }
                        if let note { Text(note).font(l.small.italic()).foregroundColor(l.faint) }
                    }
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let isOn {
                        SquareSwitch(isOn: isOn).padding(.top, 2)
                    } else if let state {
                        LedgerLabel(text: state).padding(.top, 3)
                    }
                }
                .padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(LedgerPress())
            .disabled(isOn != nil ? !isEnabled : more == nil)
            .opacity(isOn != nil && !isEnabled ? 0.5 : 1)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(isOn == true ? .isSelected : [])
            .accessibilityIdentifier(id)
            LedgerRule()
        }
    }
}

/// The ledger's own switch: a square block that springs across a ruled slot.
struct SquareSwitch: View {
    let isOn: Bool
    @Environment(\.ledger) private var l
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack(alignment: .leading) {
            Rectangle().strokeBorder(isOn ? l.accent : l.ink, lineWidth: 1.5)
            Rectangle().fill(isOn ? l.accent : l.ink).frame(width: 16, height: 16).padding(4).offset(x: isOn ? 24 : 0)
        }
        .frame(width: 48, height: 24)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.6), value: isOn)
        .accessibilityHidden(true)
    }
}

/// A line that opens in place. The header gets the toggle to wire to its own control.
struct Expandable<Header: View, Detail: View>: View {
    private let header: (@escaping () -> Void) -> Header
    private let detail: () -> Detail
    @State private var open = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(@ViewBuilder header: @escaping (_ toggle: @escaping () -> Void) -> Header, @ViewBuilder detail: @escaping () -> Detail) {
        self.header = header
        self.detail = detail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header {
                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.9)) { open.toggle() }
            }
            if open {
                VStack(alignment: .leading, spacing: 8) { detail() }
                    .padding(.leading, 40).padding(.top, 8).padding(.bottom, 16)
                    .transition(.opacity)
            }
        }
    }
}

/// A decision. Filled ones are ink on paper inverted, so Accept and Reject read the same; the
/// accent is Save alone. The one being saved keeps its strength while the others fade.
struct Stamp: View {
    let text: String
    @ObservedObject var draft: ConsentDraft
    var action: ConsentWriteAction? = nil
    var filled = true
    var accent = false
    let id: String
    let onTap: () -> Void
    @Environment(\.ledger) private var l

    var body: some View {
        let busy = action != nil && draft.showProgress && draft.savingAction == action
        Button(action: onTap) {
            Text(busy ? "… " + text : text).font(l.row)
                .foregroundColor(accent ? l.onAccent : filled ? l.paper : l.ink)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12).padding(.vertical, 14)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(accent ? l.accent : filled ? l.ink : Color.clear)
                .overlay(Rectangle().strokeBorder(accent ? l.accent : l.ink, lineWidth: 1.5))
        }
        .buttonStyle(LedgerPress())
        .disabled(draft.isSaving)
        .opacity(draft.isSaving && !busy ? 0.5 : 1)
        .accessibilityValue(busy ? draft.copy.saving : "")
        .accessibilityIdentifier(id)
    }
}

/// An underlined text control with a full-size target.
struct TextAction: View {
    let text: String
    var isEnabled = true
    let id: String
    let action: () -> Void
    @Environment(\.ledger) private var l
    var body: some View {
        Button(action: action) {
            Text(text).underline().font(l.row).foregroundColor(isEnabled ? l.ink : l.faint)
                .frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(LedgerPress())
        .disabled(!isEnabled)
        .accessibilityIdentifier(id)
    }
}

/// An underlined link that opens in the browser.
struct LedgerLink: View {
    let text: String
    let url: URL?
    @Environment(\.ledger) private var l
    var body: some View {
        if let url {
            Link(destination: url) {
                Text(text).underline().font(l.small).foregroundColor(l.accent)
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
        }
    }
}

/// A refused save: the message, and the same action again. The block already told VoiceOver.
struct Failure: View {
    @ObservedObject var draft: ConsentDraft
    let retry: () -> Void
    @Environment(\.ledger) private var l
    var body: some View {
        // A stale draft and an outdated vendor list have their own notices: sending the same save again cannot help.
        if let message = draft.errorMessage, !draft.isStale, !draft.listUnavailable {
            HStack(spacing: 12) {
                Text(message).font(l.small).foregroundColor(l.accent).frame(maxWidth: .infinity, alignment: .leading)
                TextAction(text: draft.iabCopy.appTryAgain, isEnabled: !draft.isSaving, id: "ledger.error.retry", action: retry)
            }
            .accessibilityIdentifier("ledger.error")
        }
    }
}

/// A boxed message with one action: the draft went stale, or the vendor list is out of date.
struct LedgerNotice: View {
    let title: String
    var detail: String? = nil
    let action: String
    let onTap: () -> Void
    @Environment(\.ledger) private var l
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(l.row).foregroundColor(l.ink).accessibilityAddTraits(.isHeader)
            if let detail { Text(detail).font(l.small).foregroundColor(l.faint) }
            TextAction(text: action, id: "ledger.notice.action", action: onTap)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().strokeBorder(l.accent, lineWidth: 1.5))
        .padding(.bottom, 12)
    }
}

/// Upper-case tabs with a short accent bar under the selected one.
struct LedgerTabs: View {
    let titles: [String]
    @Binding var selected: Int
    @Environment(\.ledger) private var l
    var body: some View {
        HStack(spacing: 20) {
            ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                Button { selected = index } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(title.uppercased()).font(l.label).tracking(1.8).foregroundColor(index == selected ? l.ink : l.faint)
                        Rectangle().fill(index == selected ? l.accent : Color.clear).frame(width: 24, height: 3)
                    }
                    .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(LedgerPress())
                .accessibilityAddTraits(index == selected ? .isSelected : [])
                .accessibilityIdentifier("ledger.tab.\(index)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A section name inside a page.
struct LedgerSection: View {
    let title: String
    var body: some View {
        LedgerLabel(text: title, accent: true).padding(.top, 28).padding(.bottom, 6).accessibilityAddTraits(.isHeader)
    }
}

/// A titled list of label and value lines, such as a purpose and how long its data is kept.
struct Facts: View {
    let title: String
    let facts: [(label: String, value: String?)]
    @Environment(\.ledger) private var l
    var body: some View {
        if !facts.isEmpty {
            LedgerLabel(text: title).padding(.top, 10)
            ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                HStack(alignment: .top, spacing: 12) {
                    Text(fact.label).font(l.small).foregroundColor(l.ink).frame(maxWidth: .infinity, alignment: .leading)
                    if let value = fact.value { Text(value).font(l.small).foregroundColor(l.faint) }
                }
                .padding(.vertical, 3)
            }
        }
    }
}
