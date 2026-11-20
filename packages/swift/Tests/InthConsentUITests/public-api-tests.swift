@_spi(InthInternal) import InthCore
import InthConsentUI
import Foundation
import XCTest

/// Uses only the public UI API, as a host app does. No `@testable` import in this file.
/// The core itself is started through the internal door so the test opens no socket.
@MainActor
final class PublicAPITests: XCTestCase {
    /// A host's settings screen reopens privacy choices with one public call, after any decision.
    // TCF-CHECK: P31
    func testHostCanResurfacePreferencesFromItsOwnSettings() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("../examples/native/consent-demo/fixtures/iab-init.json"))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"), initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        XCTAssertNil(presenter.presentationID, "nothing is owed, so nothing opens by itself")
        presenter.presentPreferences()
        XCTAssertNotNil(presenter.presentationID)
        XCTAssertTrue(presenter.preferences)
        XCTAssertTrue(presenter.iab)
        XCTAssertEqual(presenter.disclosure?.vendors.count, 3)
        // The reopened draft starts from what was saved.
        XCTAssertEqual(presenter.choices.purposeConsents, core.iabConsent()?.choices.purposeConsents)
    }

    /// An app-owned screen reads every row and text of the headless draft through public API.
    func testAnAppOwnedScreenReadsTheHeadlessDraftThroughPublicAPI() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let fixture = try Data(contentsOf: root.appendingPathComponent("../examples/native/consent-demo/fixtures/iab-init.json"))
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture) as? [String: Any])
        let partner: [String: Any] = [
            "id": "house-ads", "name": "House Ads", "privacyPolicyUrl": "https://example.com/house-ads/privacy",
            "purposes": [1, 7], "legIntPurposes": [7], "features": [1], "dataRetentionDays": 30, "usesCookies": false,
        ]
        json["customVendors"] = [partner]
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(try JSONSerialization.data(withJSONObject: json))),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"), initRetry: .disabled))
        await core.waitUntilIdle()

        let draft = ConsentDraft(core: core)
        XCTAssertTrue(draft.isReady && draft.isIAB && draft.isEditable)
        XCTAssertFalse(draft.isSaving || draft.showProgress || draft.isStale || draft.listUnavailable)
        XCTAssertNil(draft.savingAction)
        XCTAssertNil(draft.errorMessage)
        XCTAssertFalse(draft.copy.saving.isEmpty || draft.iabCopy.appClose.isEmpty)
        let category = try XCTUnwrap(draft.categories.first { !$0.locked })
        XCTAssertFalse(category.title.isEmpty || category.description.isEmpty)
        XCTAssertNil(category.lockedLabel)
        XCTAssertNil(category.note)
        XCTAssertTrue(category.isEnabled)
        category.set(true)
        XCTAssertEqual(draft.categoryChoices[try XCTUnwrap(OptionalConsentCategory(rawValue: category.id.rawValue))], true)

        let iab = try XCTUnwrap(draft.iab)
        XCTAssertTrue(iab.editable && iab.isDirty && !iab.isStale)
        XCTAssertEqual(iab.publisherRestrictions, [])
        XCTAssertTrue(iab.stacks.isEmpty)
        let first = iab.firstLayer
        XCTAssertFalse((first.descriptionLead + first.partnersLink + first.descriptionTail).isEmpty)
        XCTAssertFalse(first.summary.isEmpty || first.legitimateInterestNotice.isEmpty || first.scope.isEmpty || first.withdraw.isEmpty)

        let purpose = try XCTUnwrap(iab.purposes.first { $0.legitimateInterest != nil })
        XCTAssertFalse(purpose.name.isEmpty || purpose.description.isEmpty || purpose.partnersNote.isEmpty || purpose.rightToObject.isEmpty)
        XCTAssertNotNil(purpose.definition.descriptionLegal)
        XCTAssertTrue(purpose.isEnabled && !purpose.consent)
        purpose.setConsent(true)
        XCTAssertTrue(iab.choices.purposeConsents.contains(purpose.id))
        XCTAssertGreaterThan(purpose.legitimateInterestPartnerCount, 0)
        XCTAssertNotNil(iab.legitimateInterestExplanation)

        let feature = try XCTUnwrap(iab.specialFeatures.first)
        XCTAssertFalse(feature.name.isEmpty || feature.description.isEmpty)
        XCTAssertTrue(feature.isEnabled && !feature.optIn)
        feature.setOptIn(true)
        XCTAssertTrue(iab.choices.specialFeatureOptIns.contains(feature.id))
        XCTAssertFalse(feature.definition.illustrations.isEmpty && !feature.definition.hasDetails)
        XCTAssertFalse(iab.specialPurposes.isEmpty || iab.features.isEmpty || iab.featuresExplanation.isEmpty)
        _ = iab.specialPurposesExplanation
        XCTAssertNotNil(iab.consentStorage)

        // Partners come by name, each with its own page.
        XCTAssertEqual(iab.vendors.map(\.name),
            iab.vendors.map(\.name).sorted { $0.localizedStandardCompare($1) == .orderedAscending })
        XCTAssertEqual(iab.vendors.count, 3)
        XCTAssertEqual(iab.vendors(purposeId: 7).count, 3)
        XCTAssertTrue(iab.vendors(purposeId: 11).isEmpty)
        let vendor = try XCTUnwrap(iab.vendor(1))
        XCTAssertEqual(vendor.entry.id, 1)
        XCTAssertFalse(vendor.name.isEmpty || vendor.summary.isEmpty || vendor.statusLabel.isEmpty)
        XCTAssertEqual(vendor.consent, false)
        XCTAssertEqual(vendor.legitimateInterest, true)
        XCTAssertTrue(vendor.isEnabled)
        vendor.setConsent(true)
        XCTAssertEqual(draft.iab?.vendor(1)?.consent, true)
        let page = vendor.details
        XCTAssertNotNil(page.privacyPolicy)
        XCTAssertNotNil(page.legitimateInterestClaim)
        XCTAssertFalse(page.consentPurposes.isEmpty || page.legitimateInterestPurposes.isEmpty)
        XCTAssertTrue(page.notAllowedPurposes.isEmpty)
        XCTAssertFalse(page.specialPurposes.isEmpty || page.features.isEmpty || page.featuresStandardText.isEmpty)
        XCTAssertEqual(page.specialFeatureIds.count, page.specialFeatures.count)
        XCTAssertFalse(page.retention.isEmpty || page.storage.isEmpty)
        XCTAssertFalse(page.retention[0].label.isEmpty || page.retention[0].value.isEmpty)
        XCTAssertTrue(page.storesOnDevice)
        _ = (page.dataCategories, page.storageDisclosure)

        // Providers and custom partners are lists of their own.
        let provider = try XCTUnwrap(iab.adTechProviders.first)
        XCTAssertFalse(provider.name.isEmpty || iab.adTechProvidersHeading.isEmpty || iab.adTechProvidersNotice.isEmpty)
        XCTAssertNotNil(provider.policyURL)
        XCTAssertTrue(provider.isEnabled && !provider.consent)
        provider.setConsent(true)
        XCTAssertEqual(iab.choices.adTechProviderConsents, [provider.id])
        XCTAssertFalse(iab.providerPrerequisitesMet)
        let custom = try XCTUnwrap(iab.customVendors.first)
        XCTAssertEqual(custom.id, "house-ads")
        XCTAssertFalse(custom.name.isEmpty || custom.summary.isEmpty || custom.statusLabel.isEmpty)
        XCTAssertFalse(iab.customVendorsHeading.isEmpty || iab.customVendorsNotice.isEmpty)
        XCTAssertEqual(custom.consent, false)
        XCTAssertNotNil(custom.legitimateInterest)
        custom.setConsent(true)
        custom.setLegitimateInterest(false)
        XCTAssertEqual(iab.choices.customVendorConsents, ["house-ads"])
        XCTAssertEqual(iab.choices.customVendorLegitimateInterests, [])
        let customPage = custom.details
        XCTAssertFalse(customPage.note.isEmpty || customPage.consentPurposes.isEmpty || customPage.retention.isEmpty)
        XCTAssertNotNil(customPage.privacyPolicy)
        XCTAssertFalse(customPage.storesOnDevice)
        _ = (customPage.legitimateInterestPurposes, customPage.features, customPage.specialFeatureIds, customPage.specialFeatures, customPage.dataCategories, customPage.storage)

        // The same commands by id, as `useIAB()` has them on the web.
        iab.setPurposeLegitimateInterest(7, false)
        iab.setVendorLegitimateInterest(1, false)
        iab.setVendorConsent("house-ads", false)
        iab.setVendorLegitimateInterest("house-ads", true)
        iab.setSpecialFeatureOptIn(feature.id, false)
        iab.setAdTechProviderConsent(provider.id, false)
        iab.setPurposeConsent(purpose.id, false)
        iab.setVendorConsent(1, false)
        XCTAssertEqual(iab.choices.purposeObjections, [7])
        XCTAssertEqual(iab.choices.vendorObjections, [1])
        iab.rejectAll()
        iab.acceptAll()
        var saved: Bool?
        iab.save { saved = $0 }
        for _ in 0..<500 where saved == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(saved, true)
        XCTAssertNotNil(iab.tcString)
        XCTAssertNotNil(draft.lastChanged)
        XCTAssertFalse(draft.lastChanged(at: 0).isEmpty)
        iab.reset()
        draft.retry()
        draft.refresh()
    }

    private struct Peer: HTTPTransport {
        let body: Data
        init(_ body: Data) { self.body = body }
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            request.method == .get
                ? HTTPResponse(status: 200, body: body)
                : HTTPResponse(status: 503)
        }
    }
}
