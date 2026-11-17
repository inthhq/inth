import InthCore
import Foundation
import XCTest
@testable import InthConsentUI

/// The blocks: when they show content, and what their scopes do. The scopes need no view, so
/// these run wherever the draft does.
@MainActor
final class HeadlessComponentsTests: XCTestCase {
    func testThePromptShowsOnlyWhileOwedAndRejectAllSettlesIt() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let draft = ConsentDraft(core: core)
        var opened = 0
        let prompt = try XCTUnwrap(ConsentPromptScope(draft: draft, onOpenPreferences: { opened += 1 }))
        XCTAssertFalse(prompt.isNotice)
        XCTAssertEqual(prompt.title, draft.copy.headline)
        XCTAssertEqual(prompt.rejectAllLabel, draft.copy.rejectAll)
        XCTAssertEqual(prompt.detail, draft.copy.firstLayerDescription)
        XCTAssertNil(prompt.iab)
        prompt.openPreferences()
        XCTAssertEqual(opened, 1)
        prompt.rejectAll()
        // Nothing opens while the save runs.
        prompt.openPreferences()
        XCTAssertEqual(opened, 1)
        await settle(draft)
        XCTAssertNil(ConsentPromptScope(draft: draft, onOpenPreferences: {}), "an answered prompt is no longer owed")
        XCTAssertNotNil(core.snapshot().explicitChoice)
        XCTAssertFalse(core.isAllowed(.marketing))
    }

    func testTheIABPromptCarriesTheFirstLayerAndIABLabels() async throws {
        let core = try await headlessFixtureCore("iab-init.json", iab: true)
        let draft = ConsentDraft(core: core)
        let prompt = try XCTUnwrap(ConsentPromptScope(draft: draft, onOpenPreferences: {}))
        XCTAssertEqual(prompt.iab, draft.iab?.firstLayer)
        XCTAssertNotNil(prompt.iab)
        XCTAssertNil(prompt.detail)
        XCTAssertEqual(prompt.acceptAllLabel, draft.iabCopy.commonAcceptAll)
        XCTAssertEqual(prompt.customizeLabel, draft.iabCopy.commonCustomize)
    }

    func testClosingAsksBeforeDroppingUnsavedPreferences() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let draft = ConsentDraft(core: core)
        var open = true
        let scope = ConsentPreferencesScope(draft: draft, onClose: { open = false })
        try XCTUnwrap(scope.categories.first { !$0.locked }).set(true)
        scope.requestClose()
        XCTAssertTrue(open)
        XCTAssertTrue(scope.confirmDiscard)
        scope.keepEditing()
        XCTAssertFalse(scope.confirmDiscard)
        XCTAssertTrue(draft.isDirty)
        scope.requestClose()
        scope.discard()
        XCTAssertFalse(open)
        XCTAssertFalse(draft.isDirty)
        XCTAssertNil(core.snapshot().explicitChoice)
    }

    func testSavingPreferencesClosesOnlyOnSuccess() async throws {
        let store = RefusingStore()
        let core = try await headlessFixtureCore("category-init.json", store: store)
        let draft = ConsentDraft(core: core)
        var closed = 0
        let scope = ConsentPreferencesScope(draft: draft, onClose: { closed += 1 })
        try XCTUnwrap(scope.categories.first { $0.category == .measurement }).set(true)
        store.refuseNext = true
        scope.save()
        // A running save is never interrupted by a close.
        scope.requestClose()
        await settle(draft)
        XCTAssertEqual(closed, 0)
        XCTAssertNotNil(draft.errorMessage)
        scope.retry()
        await settle(draft)
        XCTAssertEqual(closed, 1)
        XCTAssertTrue(core.isAllowed(.measurement))
        XCTAssertNotNil(scope.lastChanged)
    }

    /// The blocks carry no look: none of the three files may set a colour, font, shape or padding.
    func testTheBlocksDrawNothingOfTheirOwn() throws {
        let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources/InthConsentUI")
        let styling = try NSRegularExpression(pattern:
            #"\bColor\b|\bFont\b|\.font\(|\.padding\(|\.foregroundStyle\(|\.foregroundColor\(|\.background\(|\.tint\(|\.shadow\(|\.opacity\(|cornerRadius|RoundedRectangle|Capsule\(|Circle\(|\.clipShape\("#)
        for name in ["headless-draft.swift", "headless-iab.swift", "headless-components.swift"] {
            let text = try String(contentsOf: sources.appendingPathComponent(name), encoding: .utf8)
            let match = styling.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
            XCTAssertNil(match.map { (text as NSString).substring(with: $0.range) }, "\(name) styles its content")
        }
    }

    private func settle(_ draft: ConsentDraft) async {
        for _ in 0..<500 {
            if !draft.isSaving { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("The save did not settle")
    }
}

#if canImport(SwiftUI)
import SwiftUI

extension HeadlessComponentsTests {
    func testTheGateReadsTheCommittedPermission() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let gate = ConsentGate(.measurement, core: core) { Text(verbatim: "on") } fallback: { Text(verbatim: "off") }
        XCTAssertFalse(gate.isAllowed)
        // A staged edit is not a decision.
        let draft = ConsentDraft(core: core)
        draft.setCategory(.measurement, true)
        XCTAssertFalse(gate.isAllowed)
        let saved = await draft.save()
        XCTAssertTrue(saved)
        XCTAssertTrue(gate.isAllowed)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertFalse(gate.isAllowed)
    }
}
#endif
